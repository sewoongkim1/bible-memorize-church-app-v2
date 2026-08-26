# -*- coding: utf-8 -*-
"""서명 키(keystore)에서 업로드 인증서(.pem)와 SHA-256 지문을 뽑는다.

    python tools/upload-cert.py "<패키지 폴더 경로>"

플레이 콘솔의 **업로드 키 재설정 요청**에 올릴 .pem 을 만든다.
같이 찍히는 SHA-256 지문은 `.well-known/assetlinks.json` 에 넣는 값이다.

■ 자바가 없어도 된다
  보통은 자바의 keytool 로 뽑지만, PWABuilder 가 만드는 keystore 는 **PKCS12** 형식이라
  파이썬 cryptography 로 바로 열린다. (앞 4바이트가 30 82.. 면 PKCS12,
  fe ed fe ed 면 옛 JKS 라서 이 방법이 안 통한다)

■ 비밀번호는 화면에 찍지 않는다
  같은 폴더의 signing-key-info.txt 에서 읽어 쓰기만 한다.

■ ⚠️ 패키지 폴더를 이 저장소 안에 두지 말 것
  이 저장소는 공개다. 2026-08-26 에 zip 째로 커밋돼 키가 노출된 적이 있다.
  .gitignore 로 막아 두었지만, 애초에 밖(Downloads·구글드라이브)에 두는 것이 맞다.
"""
import io, os, re, sys, hashlib
from cryptography.hazmat.primitives.serialization import pkcs12, Encoding

D = sys.argv[1] if len(sys.argv) > 1 else "."
ks = os.path.join(D, "signing.keystore")
info = os.path.join(D, "signing-key-info.txt")
for p in (ks, info):
    if not os.path.exists(p):
        print("없습니다:", p); sys.exit(1)

head = open(ks, "rb").read(4)
if head[:4] == b"\xfe\xed\xfe\xed":
    print("이 keystore 는 옛 JKS 형식이라 자바 keytool 이 필요합니다."); sys.exit(1)

pw = None
for line in io.open(info, encoding="utf-8", errors="replace").read().splitlines():
    if re.search(r"Key store password", line, re.I):
        pw = line.split(":", 1)[1].strip()
if not pw:
    print("signing-key-info.txt 에서 비밀번호를 찾지 못했습니다."); sys.exit(1)

_, cert, _ = pkcs12.load_key_and_certificates(open(ks, "rb").read(), pw.encode())
out = os.path.join(D, "upload_certificate.pem")
io.open(out, "wb").write(cert.public_bytes(Encoding.PEM))

fp = hashlib.sha256(cert.public_bytes(Encoding.DER)).hexdigest().upper()
fp = ":".join(fp[i:i + 2] for i in range(0, len(fp), 2))
print("만들었습니다:", out)
print()
print("SHA-256 지문 (assetlinks.json 에 넣는 값):")
print(" ", fp)
print()
print("다음: 콘솔 → 테스트 및 출시 → 설정 → 앱 서명 → 업로드 키 재설정 요청")
print("      위 .pem 파일을 올리면 됩니다.")
