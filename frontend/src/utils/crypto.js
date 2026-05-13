import forge from 'node-forge';

const PUBLIC_KEY_PEM = `-----BEGIN PUBLIC KEY-----
MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAsa8CdtmBwHwdavSVVoXI
6Tm+UVItn8Jpmj1GHavtSBSRCRQGcBfhGb4zlQuHkAOOB+/bDpbyMfQ8gaDOjWC6
AcD4oVgEVMy5fE9cuM+qn9KQvcNyAdoTOyA14APEvrvGrEMoPXkAh+/QD1Z9i39L
JKN7JFCD/Xfjyj5BdYzy+7qHimOvb8WNfkP3S87ew5lXDue8jcJ4Q/DJS37zFbeG
DQR2e9A+gRLSN5cMKyvMnvm2pzCvpB1YxXmvK2RyocvqpUr39Bh2YSNHAe4AhWx3
halGb8czNx5XdbsvpzrPCej1uHZ1hrJF3H1sJwhxNQOb2OM7lzLOuSlj48jCSKpi
bQIDAQAB
-----END PUBLIC KEY-----`;

const PRIVATE_KEY_PEM = `-----BEGIN PRIVATE KEY-----
MIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQCxrwJ22YHAfB1q
9JVWhcjpOb5RUi2fwmmaPUYdq+1IFJEJFAZwF+EZvjOVC4eQA44H79sOlvIx9DyB
oM6NYLoBwPihWARUzLl8T1y4z6qf0pC9w3IB2hM7IDXgA8S+u8asQyg9eQCH79AP
Vn2Lf0sko3skUIP9d+PKPkF1jPL7uoeKY69vxY1+Q/dLzt7DmVcO57yNwnhD8MlL
fvMVt4YNBHZ70D6BEtI3lwwrK8ye+banMK+kHVjFea8rZHKhy+qlSvf0GHZhI0cB
7gCFbHeFqUZvxzM3Hld1uy+nOs8J6PW4dnWGskXcfWwnCHE1A5vY4zuXMs65KWPj
yMJIqmJtAgMBAAECggEADLeTKaj4dlZGb7wuKmlnCg7siMWk3M6YFXvltmQdVpTx
lXtWA59TPdmvt5mXPAQ5HeckSqIclwfdQxox4Qtc0hkljRIE4KyKE7QwFXfNhToC
SzFUyf5O9TghYFVnYeRZfET5OWnH6Igjis7SAPzdHAlJsWgZg6JupAVlKic/+9Vi
NYCqJrFy51GYzbTK9uZ+C2CfRNNDrOadwqzMDJGqg4M1CwwfIJ/Jg3TlokbT2Dqm
f0KHfJ3MHwQ6PoR3gco9lKSKw98FgaDOQKjZAiFpjAt8Wzfp1shtfDhunoGaxJLJ
hHM2bLAbKGaK6hrG7eeiMWXrp6Vat82ZwXphvnmP4QKBgQDwFNHZHiltIXSk8Ppt
piuZh8VwupWzwwIaPNjTBHFaTHK4JOcLlyoCPeqyjNZaikgdF0YqzloUtVKb1owz
G8Oam6SvEJDvvrD2ih/qQjYwE//sgG21BZIg+Rj1Tea93ty2JUzYUwRp1RE8TTgM
JhAJaUUUmUT5qrXpP2wU3EU6IQKBgQC9dwqDXULgwGeQNfwdaPBcXUlm68FyEa20
g0FJKG9eKIujC8WEuJEmI8aIgAghTHC449T+KWtD1jVxQ5Y0HKlqAl/9TcRU9NUU
Je7znJLBYaQpqemQrOxzNt/ma9q0J2kwUjdsqSH1ao5d9fKFoZanNJ4wuvia5nAC
m7s1ArwWzQKBgAtNH5e12MNfWMtO4Kr6sIC4qG2nCtb8bgPoK1i7k85pXNkYO5wL
EJosafjfslNuwPhFmTL4pbrl0i6tycm6G9oSS41GHVx7wH7Kf7gaR8y5lEmAvilQ
StGsiCU79omnjQIx/U0Nk16b/gS1qdbAj+6xeuP+VwXdqFSDfMX6nHOhAoGAX41V
xAKY4/ilQlm3mK1/61Uw27MykHDSBiPcHSVDZV1VbxlUuCbNLUsFqXnIn+KJRvXA
SZ5h9ohl04WejxGVb11bQ8igp6gCfnLTHBFvAhBYVprWrJxJc6HNMcxbNFhb+H6+
bRKvibH/suuDMFnaPOGQlkr1bkmhW+9mbsm+SlECgYEA2d7QfySud6UbSmcDhep9
JeO4TXz6M5r83ZunaTRCyxJL5iWr5LhBRaYeQ7FMKI3KInxBDEmotuCVwCKE9pyw
SeQ6prs/41ftpgmS3I9AzALJxGV9Kj8aB8bSeEL1Q33rW4AaAPyhMWH5XZl9SGU7
7XTpFleFF7yxxtZH+5xm5ic=
-----END PRIVATE KEY-----`;

const publicKey = forge.pki.publicKeyFromPem(PUBLIC_KEY_PEM);
const privateKey = forge.pki.privateKeyFromPem(PRIVATE_KEY_PEM);

export function encryptPayload(data) {
  const jsonStr = JSON.stringify(data);
  const plaintext = forge.util.createBuffer(jsonStr, 'utf8');

  // Generate random AES key and IV
  const aesKeyBytes = forge.random.getBytesSync(32);
  const ivBytes = forge.random.getBytesSync(16);

  // Encrypt JSON with AES-GCM
  const cipher = forge.cipher.createCipher('AES-GCM', aesKeyBytes);
  cipher.start({ iv: ivBytes });
  cipher.update(plaintext);
  cipher.finish();

  const ciphertext = cipher.output.getBytes();
  const tagBytes = cipher.mode.tag.getBytes();

  // Combine ciphertext and tag (Python cryptography adds tag to the end of ciphertext)
  const combinedCiphertextBytes = ciphertext + tagBytes;

  // Encrypt the AES key with RSA-OAEP
  const encryptedAesKeyBytes = publicKey.encrypt(aesKeyBytes, 'RSA-OAEP', {
    md: forge.md.sha256.create(),
    mgf1: {
      md: forge.md.sha256.create()
    }
  });

  // Concat encrypted key + IV + ciphertext
  const finalBuffer = forge.util.createBuffer();
  finalBuffer.putBytes(encryptedAesKeyBytes);
  finalBuffer.putBytes(ivBytes);
  finalBuffer.putBytes(combinedCiphertextBytes);

  return forge.util.encode64(finalBuffer.getBytes());
}

export function decryptPayload(base64Payload) {
  const rawBytes = forge.util.decode64(base64Payload);
  
  // encrypted_aes_key = data[:256]
  const encryptedAesKeyBytes = rawBytes.substring(0, 256);
  // iv = data[256:272]
  const ivBytes = rawBytes.substring(256, 272);
  // ciphertext + tag = data[272:]
  const ciphertextWithTagBytes = rawBytes.substring(272);

  // Extract tag from the end (last 16 bytes for GCM mode)
  const ciphertextBytes = ciphertextWithTagBytes.substring(0, ciphertextWithTagBytes.length - 16);
  const tagBytes = ciphertextWithTagBytes.substring(ciphertextWithTagBytes.length - 16);

  // Decrypt the AES key with RSA-OAEP
  const aesKeyBytes = privateKey.decrypt(encryptedAesKeyBytes, 'RSA-OAEP', {
    md: forge.md.sha256.create(),
    mgf1: {
      md: forge.md.sha256.create()
    }
  });

  // Decrypt ciphertext with AES-GCM
  const decipher = forge.cipher.createDecipher('AES-GCM', aesKeyBytes);
  decipher.start({
    iv: ivBytes,
    tag: forge.util.createBuffer(tagBytes)
  });
  decipher.update(forge.util.createBuffer(ciphertextBytes));
  const pass = decipher.finish();

  if (!pass) {
    throw new Error('Authentication tag mismatch. Data may be corrupted or tampered with.');
  }

  const plaintext = decipher.output.toString('utf8');
  return JSON.parse(plaintext);
}
