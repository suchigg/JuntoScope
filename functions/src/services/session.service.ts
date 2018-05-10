import { Firestore } from '@google-cloud/firestore';
import { encryptionService } from '.';

// Shuffled alphanumerics w/o vowels and ambiguous I, l, 1, 0, O, o.
const CHARS = 'vdR8gYZ43DpNJPQkBnWXGtysHfF7z2x-Mjh9bK6Tr5c_wVLCSqm';
const BASE = CHARS.length;

const ACCESS_CODE_DURATION = 30 * 60000; // 30 minutes (in milliseconds)

export class SessionService {
  publicDataDocRef = this.firestore.doc('/public/data');
  publicSessionsRef = this.publicDataDocRef.collection('/sessions');

  constructor(private firestore: Firestore) {}

  async createSession(ownerId, connectionId, projectId, sessionData) {
    const { accessCode, expirationDate } = this.generateAccessCode();

    const sessionDocRef = this.firestore
      .collection(`/users/${ownerId}/connections/${connectionId}/sessions`)
      .doc();

    const sessionLink = await this.firestore.runTransaction(
      async transaction => {
        const sessionCode = await transaction
          .get(this.publicDataDocRef)
          .then(publicSessionsDoc => {
            // TODO: Use and update a distrbuted counter to minimize any potential impact on performance.
            // See https://firebase.google.com/docs/firestore/solutions/counters
            let fn: 'create' | 'update', uniqueNum;
            const increment = Math.floor(Math.random() * 128) + 32;

            if (!publicSessionsDoc.exists) {
              fn = 'create';
              uniqueNum = 1000000 + increment;
            } else {
              fn = 'update';
              uniqueNum = publicSessionsDoc.data().uniqueNum + increment;
            }

            transaction[fn](this.publicDataDocRef, { uniqueNum });

            return Promise.resolve(this.encode(uniqueNum));
          });

        await transaction
          .set(sessionDocRef, {
            ...sessionData,
            sessionCode,
            accessCode,
            expirationDate,
          })
          .set(this.publicSessionsRef.doc(sessionCode), {
            ownerId,
            connectionId,
            projectId,
            sessionId: sessionDocRef.id,
            participants: { [ownerId]: Date.now() },
          });
      }
    );
  }

  async refreshAccessCode(sessionLink: string, uid: string) {
    const publicSessionDocRef = this.publicSessionsRef.doc(sessionLink);

    await publicSessionDocRef.get().then(doc => {
      const docData = doc.data();

      if (!docData) {
        return Promise.reject('Invalid Session Link.');
      }

      if (docData.ownerId !== uid) {
        return Promise.reject('Only a moderator can refresh the Access Code.');
      }

      const { ownerId, connectionId, sessionId } = docData;

      const sessionDocRef = this.firestore.doc(
        `/users/${ownerId}/connections/${connectionId}/sessions/${sessionId}`
      );

      const expirationDate = Date.now() + ACCESS_CODE_DURATION;
      return sessionDocRef.update({ expirationDate });
    });
  }

  async validateSession(
    sessionLink: string,
    providedAccessCode: string,
    uid: string
  ) {
    const nowTimestamp = Date.now();
    const publicSessionDocRef = this.publicSessionsRef.doc(sessionLink);

    return await publicSessionDocRef
      .get()
      .then(doc => {
        const docData = doc.data();

        if (!docData) {
          return Promise.reject('Invalid Session Link.');
        }

        if (docData.participants && docData.participants[uid]) {
          return Promise.reject('Already a participant of this session.');
        }

        const { ownerId, connectionId, sessionId } = docData;

        return this.firestore
          .doc(
            `/users/${ownerId}/connections/${connectionId}/sessions/${sessionId}`
          )
          .get();
      })
      .then(sessionDoc => {
        const { accessCode, expirationDate } = sessionDoc.data();

        if (providedAccessCode !== accessCode) {
          return Promise.reject('Invalid Access Code.');
        }

        if (expirationDate < nowTimestamp) {
          return Promise.reject('Access Code Expired.');
        }

        return publicSessionDocRef.update(`participants.${uid}`, nowTimestamp);
      });
  }

  private generateAccessCode() {
    const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    const expirationDate = Date.now() + ACCESS_CODE_DURATION;
    let accessCode = '';

    for (let i = 0; i < 5; i++) {
      accessCode += letters.charAt(Math.floor(Math.random() * letters.length));
    }

    return { accessCode, expirationDate };
  }

  // Bijective Enumeration -- Number to String
  private encode(id: number) {
    let encoded = '';

    while (id > 0) {
      encoded = CHARS.charAt(id % BASE) + encoded;
      id = Math.floor(id / BASE);
    }

    return encoded;
  }

  // Bijective Enumeration -- String to Number
  private decode(str: string) {
    let id = 0;

    for (let i = 0, len = str.length; i < len; i++) {
      id = id * BASE + CHARS.indexOf(str.charAt(i));
    }

    return id;
  }
}