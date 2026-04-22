import { initializeApp } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-app.js";
import {
  getFirestore,
  collection,
  query,
  where,
  getDocs,
  addDoc,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js";

const ADMIN_PASSWORD = "123"; // Ganti dengan sandi yang Anda inginkan
// ================= FIREBASE CONFIG =================
const firebaseConfig = {
  apiKey: "AIzaSyDLWmLmmSZKgpMevsXD6pi5DK1ziCnSQZg",
  authDomain: "absen-4fc96.firebaseapp.com",
  projectId: "absen-4fc96",
  storageBucket: "absen-4fc96.firebasestorage.app",
  messagingSenderId: "232716276485",
  appId: "1:232716276485:web:fd7fd919926e68e90f1d6c",
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// ================= GLOBAL STATE =================
let activeUser = null;
let stream = null;
let isProcessing = false;
let rfidBuffer = "";

const soundSuccess = document.getElementById("sound-success");
const soundError = document.getElementById("sound-error");

// ================= MODAL CONTROLLER =================
function showModal(title, message, type = "info") {
  const modal = document.getElementById("system-modal");
  const mIcon = document.getElementById("modal-icon");
  const mTitle = document.getElementById("modal-title");
  const mMsg = document.getElementById("modal-message");

  mIcon.className =
    "w-20 h-20 mx-auto mb-6 rounded-3xl flex items-center justify-center ";

  if (type === "success") {
    mIcon.classList.add("bg-green-500/20", "text-green-400");
    mIcon.innerHTML = '<i data-feather="check-circle" class="w-12 h-12"></i>';
  } else if (type === "error") {
    mIcon.classList.add("bg-red-500/20", "text-red-400");
    mIcon.innerHTML = '<i data-feather="x-circle" class="w-12 h-12"></i>';
  } else {
    mIcon.classList.add("bg-indigo-500/20", "text-indigo-400");
    mIcon.innerHTML = '<i data-feather="info" class="w-12 h-12"></i>';
  }

  mTitle.innerText = title;
  mMsg.innerText = message;

  modal.classList.remove("hidden");
  setTimeout(() => modal.classList.replace("opacity-0", "opacity-100"), 10);
  feather.replace();

  if (type !== "info") {
    setTimeout(hideModal, 2500);
  }
}

function hideModal() {
  const modal = document.getElementById("system-modal");
  if (!modal.classList.contains("hidden")) {
    modal.classList.replace("opacity-100", "opacity-0");
    setTimeout(() => modal.classList.add("hidden"), 300);
  }
}

// ================= CORE LOGIC =================
window.addEventListener("DOMContentLoaded", async () => {
  showModal("System", "Inisialisasi AI...", "info");
  await loadModels();
  hideModal();
});

async function loadModels() {
  const MODEL_URL =
    "https://cdn.jsdelivr.net/gh/justadudewhohacks/face-api.js/weights";
  try {
    await Promise.all([
      faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
      faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
      faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL),
    ]);
    console.log("Models Loaded");
  } catch (err) {
    showModal("Error", "Gagal memuat Model AI", "error");
  }
}

// RFID KEYBOARD LISTENER
document.addEventListener("keypress", (e) => {
  if (e.key === "Enter") {
    if (rfidBuffer.length > 2) {
      handleRFIDInput(rfidBuffer);
      rfidBuffer = "";
    }
  } else {
    rfidBuffer += e.key;
  }
});

async function handleRFIDInput(code) {
  if (isProcessing) return;

  const q = query(collection(db, "karyawan"), where("rfid", "==", code));
  const snap = await getDocs(q);

  if (!snap.empty) {
    activeUser = snap.docs[0].data();
    document.getElementById("display-name").innerText = activeUser.nama;
    document.getElementById("display-divisi").innerText = activeUser.divisi;
    transitionToFaceMode();
  } else {
    soundError.play();
    showModal("Gagal", "Kartu RFID tidak terdaftar!", "error");
  }
}

async function transitionToFaceMode() {
  // UI Switch
  document
    .getElementById("rfid-screen")
    .classList.add("opacity-0", "pointer-events-none");
  const faceScreen = document.getElementById("face-screen");
  faceScreen.classList.replace("opacity-0", "opacity-100");
  faceScreen.classList.replace("scale-110", "scale-100");
  faceScreen.classList.remove("pointer-events-none");

  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: { width: 640, height: 480, facingMode: "user" },
    });
    const video = document.getElementById("video");
    video.srcObject = stream;

    // Tunggu video benar-benar bermain sebelum scan
    video.onloadedmetadata = () => {
      video.play();
      startVerificationProcess();
    };
  } catch (err) {
    showModal("Camera", "Akses kamera ditolak!", "error");
    resetToHome();
  }
}

async function startVerificationProcess() {
  if (isProcessing) return;

  const video = document.getElementById("video");
  const loadingSpinner = document.getElementById("ai-loading");
  const statusText = document.getElementById("status-text");

  loadingSpinner.style.display = "block";
  statusText.innerText = "Menganalisis Wajah...";

  let detection = null;
  let attempts = 0;
  const maxAttempts = 30; // Percobaan selama ~6-10 detik

  // LOOP SCANNING
  while (!detection && attempts < maxAttempts) {
    if (!activeUser) break; // Jika di-reset manual

    detection = await faceapi
      .detectSingleFace(
        video,
        new faceapi.TinyFaceDetectorOptions({ inputSize: 320 }),
      )
      .withFaceLandmarks()
      .withFaceDescriptor();

    attempts++;
    console.log(`Attempt ${attempts}`);

    if (!detection) {
      await new Promise((r) => setTimeout(r, 200)); // Jeda antar frame
    }
  }

  loadingSpinner.style.display = "none";

  if (detection) {
    // Bandingkan wajah (Data di DB harus berupa array descriptor)
    const distance = faceapi.euclideanDistance(
      detection.descriptor,
      activeUser.faceModel,
    );

    if (distance < 0.45) {
      handleSuccess();
    } else {
      handleFailure("Wajah tidak cocok!");
    }
  } else {
    handleFailure("Wajah tidak terdeteksi!");
  }
}

async function handleSuccess() {
  isProcessing = true;
  soundSuccess.play();

  try {
    await addDoc(collection(db, "absensi"), {
      nama: activeUser.nama,
      rfid: activeUser.rfid,
      divisi: activeUser.divisi,
      waktu: serverTimestamp(),
      status: "Hadir",
    });

    document
      .getElementById("success-overlay")
      .classList.replace("hidden", "flex");
    setTimeout(resetToHome, 2500);
  } catch (err) {
    showModal("Error", "Gagal menyimpan data", "error");
    isProcessing = false;
  }
}

function handleFailure(msg) {
  soundError.play();
  showModal("Gagal", msg, "error");
  setTimeout(resetToHome, 2500);
}

function resetToHome() {
  // Hentikan Kamera
  if (stream) {
    stream.getTracks().forEach((t) => t.stop());
    stream = null;
  }

  activeUser = null;
  isProcessing = false;

  // UI Reset
  document
    .getElementById("rfid-screen")
    .classList.remove("opacity-0", "pointer-events-none");
  const faceScreen = document.getElementById("face-screen");
  faceScreen.classList.replace("opacity-100", "opacity-0");
  faceScreen.classList.add("scale-110", "pointer-events-none");

  document
    .getElementById("success-overlay")
    .classList.replace("flex", "hidden");
  document.getElementById("ai-loading").style.display = "none";
  document.getElementById("status-text").innerText = "Mencari Wajah...";
  document.getElementById("display-name").innerText = "Selamat Datang";
  document.getElementById("display-divisi").innerText =
    "Sistem Absensin SPPG v1.0";

  // Pastikan input RFID fokus kembali
  document.getElementById("rfid-listener").focus();
}

import {
  onSnapshot,
  doc,
} from "https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js";

// Panggil fungsi ini saat startup
fetchDashboardData();

function fetchDashboardData() {
  // --- 1. Ambil Menu & Total Penerima (Koleksi: system, Dokumen: daily_info) ---
  // Pastikan kamu membuat koleksi "system" dan dokumen "daily_info" di Firebase
  // --- 1. Ambil Menu & Total Penerima ---
  onSnapshot(doc(db, "system", "daily_info"), (snapshot) => {
    if (snapshot.exists()) {
      const data = snapshot.data();
      const menuContainer = document.getElementById("info-menu");
      const rawMenu = data.menu || "Menu Belum Tersedia";

      // Logika Mengubah String menjadi List
      // Kita asumsikan menu dipisah dengan koma (,) atau baris baru (\n)
      if (data.menu) {
        const menuItems = rawMenu.split(/,|\n/);
        menuContainer.innerHTML = `
        <ul class="list-disc list-inside text-sm space-y-1">
          ${menuItems.map((item) => `<li>${item.trim()}</li>`).join("")}
        </ul>
      `;
      } else {
        menuContainer.innerText = rawMenu;
      }

      document.getElementById("info-penerima").innerText =
        data.total_penerima || "0";
    } else {
      console.warn("Dokumen system/daily_info tidak ditemukan!");
    }
  });

  // --- 2. Ambil List Divisi (Koleksi: divisi) ---
  // Mengacu pada gambar database kamu (field: nama)
  onSnapshot(collection(db, "divisi"), (snapshot) => {
    const listContainer = document.getElementById("divisi-list");
    listContainer.innerHTML = ""; // Bersihkan list sebelum update

    snapshot.forEach((docSnap) => {
      const div = docSnap.data();

      // Gunakan div.nama sesuai dengan field di screenshot kamu
      // Jika jam_masuk belum ada di database, kamu bisa menambahkannya di Firebase
      const jamMasuk = div.jam_masuk || "--:--";
      const namaDivisi = div.nama || "Tanpa Nama";

      const itemHTML = `
                <div class="flex items-center justify-between p-4 bg-white border border-slate-100 rounded-2xl shadow-sm transition-all hover:border-indigo-200">
                    <div class="flex items-center gap-3">
                        <div class="w-10 h-10 rounded-xl bg-indigo-50 flex items-center justify-center">
                            <i data-feather="users" class="w-5 h-5 text-indigo-600"></i>
                        </div>
                        <div>
                            <span class="block font-bold text-slate-700">${namaDivisi}</span>
                            <span class="text-[10px] text-slate-400 font-medium uppercase tracking-wider">Shift Pagi</span>
                        </div>
                    </div>
                    <div class="text-right">
                        <span class="text-xs font-black text-indigo-600 bg-indigo-50 px-3 py-1.5 rounded-lg border border-indigo-100">
                            ${jamMasuk} WIB
                        </span>
                    </div>
                </div>
            `;
      listContainer.insertAdjacentHTML("beforeend", itemHTML);
    });

    // Render ulang icon feather
    feather.replace();
  });
}

window.handleSecureExit = handleSecureExit;

// Fungsi untuk tombol "Log Out" atau saat ingin kembali ke menu RFID secara paksa
function handleSecureExit() {
  const password = prompt("Masukkan Sandi Administrator untuk keluar:");

  if (password === ADMIN_PASSWORD) {
    // Jika sandi benar, jalankan fungsi reset
    executeExit();
  } else {
    alert("Sandi Salah! Akses Ditolak.");
  }
}

function executeExit() {
  if (stream) {
    stream.getTracks().forEach((t) => t.stop());
    stream = null;
  }

  activeUser = null;
  isProcessing = false;

  // Reset UI
  document
    .getElementById("rfid-screen")
    .classList.remove("opacity-0", "pointer-events-none");
  const faceScreen = document.getElementById("face-screen");
  faceScreen.classList.replace("opacity-100", "opacity-0");
  faceScreen.classList.add("scale-110", "pointer-events-none");

  document
    .getElementById("success-overlay")
    .classList.replace("flex", "hidden");
  document.getElementById("ai-loading").style.display = "none";
  document.getElementById("status-text").innerText = "Mencari Wajah...";

  // Kembalikan fokus ke RFID
  document.getElementById("rfid-listener").focus();
}
