import base64
import os
import json
from pathlib import Path

from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import padding
from cryptography.hazmat.primitives.ciphers import Cipher, algorithms, modes
from jose import JWTError, jwt

# ── Key loading ────────────────────────────────────────────────────────────────
# Resolve paths relative to this file so they work regardless of CWD at startup.
_BASE_DIR = Path(__file__).parent.resolve()

with open(_BASE_DIR / "private_key.pem", "rb") as f:
    private_key = serialization.load_pem_private_key(f.read(), password=None)

with open(_BASE_DIR / "public_key.pem", "rb") as f:
    public_key = serialization.load_pem_public_key(f.read())

SECRET_KEY = os.getenv("JWT_SECRET", "your-super-secret-key-change-this")


def decrypt_request(encrypted_data: str):
    data = base64.b64decode(encrypted_data)
    encrypted_aes_key = data[:256]
    iv = data[256:272]
    tag = data[-16:]
    ciphertext = data[272:-16]

    aes_key = private_key.decrypt(
        encrypted_aes_key,
        padding.OAEP(mgf=padding.MGF1(algorithm=hashes.SHA256()), algorithm=hashes.SHA256(), label=None)
    )

    cipher = Cipher(algorithms.AES(aes_key), modes.GCM(iv, tag))
    decryptor = cipher.decryptor()
    plaintext = decryptor.update(ciphertext) + decryptor.finalize()
    return json.loads(plaintext.decode())


def encrypt_response(data: dict):
    plaintext = json.dumps(data).encode()
    aes_key = os.urandom(32)
    iv = os.urandom(16)

    cipher = Cipher(algorithms.AES(aes_key), modes.GCM(iv))
    encryptor = cipher.encryptor()
    ciphertext = encryptor.update(plaintext) + encryptor.finalize()
    tag = encryptor.tag

    encrypted_aes_key = public_key.encrypt(
        aes_key,
        padding.OAEP(mgf=padding.MGF1(algorithm=hashes.SHA256()), algorithm=hashes.SHA256(), label=None)
    )

    return base64.b64encode(encrypted_aes_key + iv + ciphertext + tag).decode()


def verify_token(token: str):
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=["HS256"])
        return payload
    except JWTError:
        return None
