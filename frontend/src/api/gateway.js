import axios from 'axios';
import { encryptPayload, decryptPayload } from '../utils/crypto';

// If deployed via Docker, we access via same origin, but for local dev we hit localhost:8000
const API_BASE = 'http://localhost:8000/api';

/**
 * Creates an encrypted request, sends it to the Gateway, and decrypts the response.
 */
export async function secureGatewayCall(action, params = {}, token = null) {
    try {
        const payload = {
            action,
            params,
            token
        };

        const encryptedData = encryptPayload(payload);

        const res = await axios.post(`${API_BASE}/process`, { payload: encryptedData }, {
            timeout: 240000 // 240 seconds — matches gateway's backend timeout for CPU-heavy inference
        });

        if (res.data?.payload) {
            const result = decryptPayload(res.data.payload);
            if (result && result.error && (result.error.includes('Unauthorized') || result.error.includes('Premium AI features require login'))) {
                window.dispatchEvent(new Event('np-unauthorized'));
            }
            return result;
        }

        return res.data;
    } catch (err) {
        console.error(`Gateway Call Error [${action}]:`, err);
        throw err;
    }
}
