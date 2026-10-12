# -*- coding: utf-8 -*-
"""tools/deploy-fn.py 의 판단 함수 시험 — 준비물 없음(표준 라이브러리 unittest).

    python tests/deploy-fn-guard.py

git·supabase 는 부르지 않는다(순수 함수만). 실제 배포 명령은 어떤 경우에도 안 돈다.
"""
import importlib.util, os, sys, unittest

try: sys.stdout.reconfigure(encoding="utf-8")
except Exception: pass

sys.dont_write_bytecode = True
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
_spec = importlib.util.spec_from_file_location("deploy_fn", os.path.join(ROOT, "tools", "deploy-fn.py"))
D = importlib.util.module_from_spec(_spec); _spec.loader.exec_module(D)


def levels(msgs):
    return [lv for lv, _ in msgs]


class Judge(unittest.TestCase):
    def test_clean_same_passes_both(self):
        for env in ("dev", "prod"):
            ok, msgs = D.judge(env, [], [], [], [], False)
            self.assertTrue(ok)
            self.assertEqual(levels(msgs), ["통과"])

    def test_dirty_blocks_both_even_with_allow_ahead(self):
        dirty = [(" M", "supabase/functions/api/index.ts")]
        self.assertFalse(D.judge("dev", dirty, [], [], [], True)[0])
        self.assertFalse(D.judge("prod", dirty, [], [], [], False)[0])

    def test_untracked_blocks(self):
        ok, msgs = D.judge("dev", [("??", "supabase/functions/api/x.ts")], [], [], [], True)
        self.assertFalse(ok)
        self.assertIn("x.ts", msgs[0][1])

    def test_ahead_prod_blocks(self):
        ok, _ = D.judge("prod", [], ["supabase/functions/api/index.ts"], [], [], False)
        self.assertFalse(ok)

    def test_ahead_dev_needs_flag(self):
        self.assertFalse(D.judge("dev", [], ["supabase/functions/api/index.ts"], [], [], False)[0])
        ok, msgs = D.judge("dev", [], ["supabase/functions/api/index.ts"], [], [], True)
        self.assertTrue(ok)
        self.assertEqual(levels(msgs), ["경고"])

    def test_behind_blocks_even_dev_with_flag(self):
        behind = ["abc1234 feat(api): 봉사 당번 액션"]
        ok, msgs = D.judge("dev", [], ["supabase/functions/api/index.ts"], behind, [], True)
        self.assertFalse(ok)
        self.assertIn("뒤처졌다", "".join(m for _, m in msgs))

    def test_missing_actions_named(self):
        f = ["supabase/functions/api/index.ts"]
        ok, msgs = D.judge("prod", [], f, [], ["dutyList", "eduApply"], False)
        self.assertFalse(ok)
        text = "".join(m for _, m in msgs)
        self.assertIn("dutyList", text)
        self.assertIn("eduApply", text)
        # 개발 · 플래그 없음 → 막음
        self.assertFalse(D.judge("dev", [], f, [], ["dutyList"], False)[0])
        # 개발 · --allow-ahead · 뒤처지지 않음 → 일부러 지운 것으로 보고 경고만
        ok, msgs = D.judge("dev", [], f, [], ["dutyList"], True)
        self.assertTrue(ok)
        self.assertEqual(levels(msgs), ["경고", "경고"])
        # 개발 · --allow-ahead 라도 뒤처졌으면 → 막음
        self.assertFalse(D.judge("dev", [], f, ["abc feat"], ["dutyList"], True)[0])


class Parse(unittest.TestCase):
    def test_porcelain(self):
        out = " M supabase/functions/api/index.ts\0?? supabase/functions/api/new.ts\0R  b.ts\0a.ts\0"
        self.assertEqual(D.parse_porcelain(out), [
            (" M", "supabase/functions/api/index.ts"),
            ("??", "supabase/functions/api/new.ts"),
            ("R ", "b.ts"),
        ])
        self.assertEqual(D.parse_porcelain(""), [])

    def test_case_actions(self):
        src = '''switch (body.action) {
      case "login": {
      case "dutyList":   // 주석
        const s = 'case "notAction":';
      case "eduApply" : {
    }'''
        self.assertEqual(D.case_actions(src), {"login", "dutyList", "eduApply"})
        self.assertEqual(D.case_actions(None), set())

    def test_relative_imports(self):
        src = '''import { a } from "../_shared/cors.ts";
import webpush from "npm:web-push@3.6.7";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
export * from './util.ts';
const m = await import("../_shared/lazy.ts");'''
        self.assertEqual(D.relative_imports(src, "supabase/functions/api/index.ts"), [
            "supabase/functions/_shared/cors.ts",
            "supabase/functions/_shared/lazy.ts",
            "supabase/functions/api/util.ts",
        ])

    def test_real_api_has_actions(self):
        with open(os.path.join(ROOT, "supabase/functions/api/index.ts"), encoding="utf-8") as f:
            acts = D.case_actions(f.read())
        self.assertIn("login", acts)
        self.assertGreater(len(acts), 100)


if __name__ == "__main__":
    unittest.main(verbosity=1)
