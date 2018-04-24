import * as crypto from 'crypto';

import { config } from '.';

export class EncryptionService {
  private algorithm = 'aes-256-cbc';
  private SECRET_KEY = config.encryption.secret; // Must be 32 characters long

  encrypt(text: string) {
    const iv = crypto.randomBytes(16); // Must be 16 bytes long for AES encryption
    const cipher = crypto.createCipheriv(this.algorithm, new Buffer(this.SECRET_KEY), iv);

    let encrypted = cipher.update(text, 'utf8');
    encrypted = Buffer.concat([encrypted, cipher.final()]);

    return `${iv.toString('hex')}:${encrypted.toString('hex')}`;
  }

  decrypt(text: string) {
    const parts = text.split(':');
    const iv = new Buffer(parts.shift(), 'hex');
    const encryptedText = new Buffer(parts.join(':'), 'hex');
    const decipher = crypto.createDecipheriv(this.algorithm, new Buffer(this.SECRET_KEY), iv);

    let decrypted = decipher.update(encryptedText);
    decrypted = Buffer.concat([decrypted, decipher.final()]);

    return decrypted.toString();
  }
}
