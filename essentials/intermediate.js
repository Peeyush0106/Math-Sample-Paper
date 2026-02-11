// Firebase initialization
const firebaseConfig = {
    apiKey: "AIzaSyCqJkTb17dzGlAuAIQMQFdR9PH4za6pZBc",
    authDomain: "math-sample-paper.firebaseapp.com",
    databaseURL: "https://math-sample-paper-default-rtdb.firebaseio.com",
    projectId: "math-sample-paper",
    storageBucket: "math-sample-paper.firebasestorage.app",
    messagingSenderId: "738921322478",
    appId: "1:738921322478:web:256920d3f2270f4723a0ff"
};
firebase.initializeApp(firebaseConfig);

var database = firebase.database();
var storage = firebase.storage();

/**
 * Upload blob to Firebase Storage
 * @param {Blob} blob - The blob to upload
 * @param {string} path - Storage path (e.g., "sessions/session123/image_1.jpg")
 * @returns {Promise<string>} Download URL of uploaded file
 */
async function uploadBlobToStorage(blob, path) {
    try {
        const ref = storage.ref(path);
        await ref.put(blob);
        const downloadUrl = await ref.getDownloadURL();
        console.log(`✅ Uploaded: ${path}`);
        return downloadUrl;
    } catch (error) {
        console.error(`❌ Upload failed for ${path}:`, error);
        throw error;
    }
}

/**
 * Upload data to Firebase Realtime Database
 * @param {string} path - Database path (e.g., "sessions/session123")
 * @param {object} data - Data to upload
 * @returns {Promise<void>}
 */
async function uploadToDatabase(path, data) {
    try {
        await database.ref(path).set(data);
        console.log(`✅ Database update: ${path}`);
    } catch (error) {
        console.error(`❌ Database update failed for ${path}:`, error);
        throw error;
    }
}

/**
 * Generate a unique session ID based on timestamp and fingerprint
 */
function generateSessionId() {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 9);
    return `session_${timestamp}_${random}`;
}