// Modern ES Module imports for Firebase Web SDK
import { firebaseConfig } from './firebase-config.js';
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js';
import { getFirestore, doc, getDoc, setDoc, collection, query, where, getDocs } from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js';

// Define Firebase module variables
let db = null;
let isFirebaseActive = false;

// Initialize Firebase/Mock DB Check
const isConfigured = firebaseConfig && firebaseConfig.apiKey && firebaseConfig.apiKey !== "YOUR_API_KEY" && firebaseConfig.apiKey !== "";

if (isConfigured) {
  try {
    const app = initializeApp(firebaseConfig);
    db = getFirestore(app);
    isFirebaseActive = true;
    console.log("Firebase Firestore initialized successfully!");
  } catch (error) {
    console.error("Firebase initialization failed, falling back to LocalStorage:", error);
  }
} else {
  console.warn("Firebase config not provided or using template. Running in LocalStorage fallback mode.");
}

// Helper: Get YYYY-MM-DD formatted date string in local timezone
function getLocalDateString(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// Data Access Layer (Dynamic Firestore / LocalStorage)
async function fetchMonthData(year, month) {
  const startDay = `${year}-${String(month + 1).padStart(2, '0')}-01`;
  const endDay = `${year}-${String(month + 1).padStart(2, '0')}-31`; // Simple range check
  
  if (isFirebaseActive) {
    try {
      const q = query(
        collection(db, "workout_logs"),
        where("date", ">=", startDay),
        where("date", "<=", endDay)
      );
      const querySnapshot = await getDocs(q);
      const data = {};
      querySnapshot.forEach((doc) => {
        data[doc.id] = doc.data();
      });
      return data;
    } catch (e) {
      console.error("Error fetching Firestore data, fallback to localStorage:", e);
    }
  }
  
  // LocalStorage Fallback
  const data = {};
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key.startsWith("workout_") && key >= `workout_${startDay}` && key <= `workout_${endDay}`) {
      const dateKey = key.replace("workout_", "");
      try {
        data[dateKey] = JSON.parse(localStorage.getItem(key));
      } catch (err) {}
    }
  }
  return data;
}

async function saveDayData(dateStr, meDone, girlfriendDone) {
  const logData = {
    date: dateStr,
    me: meDone,
    girlfriend: girlfriendDone,
    updatedAt: new Date().toISOString()
  };

  if (isFirebaseActive) {
    try {
      await setDoc(doc(db, "workout_logs", dateStr), logData);
      return;
    } catch (e) {
      console.error("Error writing Firestore document: ", e);
    }
  }
  
  // LocalStorage Fallback
  localStorage.setItem(`workout_${dateStr}`, JSON.stringify(logData));
}

// State Variables
let currentYear = new Date().getFullYear();
let currentMonth = new Date().getMonth(); // 0-11
let monthlyLogs = {}; // Key: "YYYY-MM-DD", Value: { me: bool, girlfriend: bool }
let currentPin = "";
const CORRECT_PIN = "1209";

// DOM Elements
const passwordGate = document.getElementById('password-gate');
const appContainer = document.getElementById('app-container');
const pinDots = document.querySelectorAll('.pin-dot');
const errorMsg = document.getElementById('error-msg');
const prevMonthBtn = document.getElementById('prev-month');
const nextMonthBtn = document.getElementById('next-month');
const currentMonthYearText = document.getElementById('current-month-year');
const calendarDaysGrid = document.getElementById('calendar-days');
const btnLogout = document.getElementById('btn-logout');

// Quick Check-in DOM elements
const todayDateText = document.getElementById('today-date');
const chkMeBtn = document.getElementById('chk-me');
const chkGirlfriendBtn = document.getElementById('chk-girlfriend');

// Modal Elements
const dayModal = document.getElementById('day-modal');
const modalDateTitle = document.getElementById('modal-date-title');
const modalChkMe = document.getElementById('modal-chk-me');
const modalChkGirlfriend = document.getElementById('modal-chk-girlfriend');
const modalClose = document.getElementById('modal-close');
const btnSaveModal = document.getElementById('btn-save-modal');
const loadingOverlay = document.getElementById('loading-overlay');

let activeModalDateStr = "";

// Password Check logic
function setupPasswordGate() {
  // Check session / persistence
  if (localStorage.getItem('isUserAuth') === 'true') {
    enterApp();
    return;
  }

  // Set up keypad listeners
  document.querySelectorAll('.key-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const val = btn.getAttribute('data-val');
      if (val !== null) {
        if (currentPin.length < 4) {
          currentPin += val;
          updatePinDisplay();
          if (currentPin.length === 4) {
            verifyPin();
          }
        }
      }
    });
  });

  document.getElementById('key-clear').addEventListener('click', () => {
    currentPin = "";
    updatePinDisplay();
    errorMsg.classList.remove('visible');
  });

  document.getElementById('key-delete').addEventListener('click', () => {
    if (currentPin.length > 0) {
      currentPin = currentPin.slice(0, -1);
      updatePinDisplay();
      errorMsg.classList.remove('visible');
    }
  });
}

function updatePinDisplay() {
  pinDots.forEach((dot, index) => {
    if (index < currentPin.length) {
      dot.classList.add('filled');
    } else {
      dot.classList.remove('filled');
    }
  });
}

function verifyPin() {
  if (currentPin === CORRECT_PIN) {
    localStorage.setItem('isUserAuth', 'true');
    // Smooth transition
    passwordGate.style.opacity = 0;
    passwordGate.style.transition = 'opacity 0.3s ease';
    setTimeout(() => {
      passwordGate.classList.add('hidden');
      enterApp();
    }, 300);
  } else {
    errorMsg.classList.add('visible');
    // Vibrate / Shake visual effect
    const gateCard = document.querySelector('.gate-card');
    gateCard.style.animation = 'shake 0.3s ease';
    setTimeout(() => {
      gateCard.style.animation = '';
      currentPin = "";
      updatePinDisplay();
    }, 300);
  }
}

// Shake animation
const styleSheet = document.createElement("style");
styleSheet.innerText = `
  @keyframes shake {
    0%, 100% { transform: translateX(0); }
    25% { transform: translateX(-8px); }
    75% { transform: translateX(8px); }
  }
`;
document.head.appendChild(styleSheet);

function enterApp() {
  passwordGate.classList.add('hidden');
  appContainer.classList.remove('hidden');
  initCalendar();
}

// Calendar Logic
async function initCalendar() {
  updateTodayCheckinWidget();
  await loadAndRenderMonth();

  // Next / Prev Month actions
  prevMonthBtn.addEventListener('click', async () => {
    currentMonth--;
    if (currentMonth < 0) {
      currentMonth = 11;
      currentYear--;
    }
    await loadAndRenderMonth();
  });

  nextMonthBtn.addEventListener('click', async () => {
    currentMonth++;
    if (currentMonth > 11) {
      currentMonth = 0;
      currentYear++;
    }
    await loadAndRenderMonth();
  });

  // Logout action
  btnLogout.addEventListener('click', () => {
    localStorage.removeItem('isUserAuth');
    window.location.reload();
  });

  // Setup Today check-in click events
  chkMeBtn.addEventListener('click', () => toggleTodayWorkout('me'));
  chkGirlfriendBtn.addEventListener('click', () => toggleTodayWorkout('girlfriend'));

  // Setup Modal Closing
  modalClose.addEventListener('click', closeModal);
  dayModal.addEventListener('click', (e) => {
    if (e.target === dayModal) closeModal();
  });

  // Setup Modal Save
  btnSaveModal.addEventListener('click', saveModalChanges);
}

function updateTodayCheckinWidget() {
  const today = new Date();
  todayDateText.innerText = `${today.getMonth() + 1}월 ${today.getDate()}일`;
}

async function loadAndRenderMonth() {
  showLoading(true);
  monthlyLogs = await fetchMonthData(currentYear, currentMonth);
  renderCalendar();
  updateStats();
  showLoading(false);
}

function renderCalendar() {
  // Title update
  currentMonthYearText.innerText = `${currentYear}년 ${currentMonth + 1}월`;
  
  calendarDaysGrid.innerHTML = '';
  
  const firstDayIndex = new Date(currentYear, currentMonth, 1).getDay();
  const totalDays = new Date(currentYear, currentMonth + 1, 0).getDate();
  
  const today = new Date();
  const todayStr = getLocalDateString(today);

  // Generate blank spaces for alignment
  for (let i = 0; i < firstDayIndex; i++) {
    const emptyCell = document.createElement('div');
    emptyCell.className = 'day-cell empty';
    calendarDaysGrid.appendChild(emptyCell);
  }

  // Generate day cells
  for (let day = 1; day <= totalDays; day++) {
    const dayCell = document.createElement('div');
    dayCell.className = 'day-cell';
    
    // Check Sunday/Saturday classes
    const dayOfWeek = (firstDayIndex + day - 1) % 7;
    if (dayOfWeek === 0) dayCell.classList.add('sunday');
    if (dayOfWeek === 6) dayCell.classList.add('saturday');

    const dateStr = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    
    if (dateStr === todayStr) {
      dayCell.classList.add('today');
    }

    // Number text
    const numberSpan = document.createElement('span');
    numberSpan.className = 'day-number';
    numberSpan.innerText = day;
    dayCell.appendChild(numberSpan);

    // Indicator row
    const indicatorRow = document.createElement('div');
    indicatorRow.className = 'indicator-row';

    const dayLog = monthlyLogs[dateStr] || { me: false, girlfriend: false };

    // Me (Indigo)
    const indMe = document.createElement('span');
    indMe.className = 'indicator' + (dayLog.me ? ' male-done' : '');
    indicatorRow.appendChild(indMe);

    // Girlfriend (Pink)
    const indGirlfriend = document.createElement('span');
    indGirlfriend.className = 'indicator' + (dayLog.girlfriend ? ' female-done' : '');
    indicatorRow.appendChild(indGirlfriend);

    dayCell.appendChild(indicatorRow);

    // Click handler -> Edit detailed records
    dayCell.addEventListener('click', () => openDayModal(dateStr, dayLog));

    calendarDaysGrid.appendChild(dayCell);

    // Synchronize today checkin widget values if rendering current month/day
    if (dateStr === todayStr) {
      updateTodayWidgetState(dayLog.me, dayLog.girlfriend);
    }
  }
}

function updateTodayWidgetState(meDone, girlfriendDone) {
  if (meDone) {
    chkMeBtn.classList.add('checked');
    chkMeBtn.querySelector('span').innerText = '오늘 완료!';
  } else {
    chkMeBtn.classList.remove('checked');
    chkMeBtn.querySelector('span').innerText = '오늘 안함';
  }

  if (girlfriendDone) {
    chkGirlfriendBtn.classList.add('checked');
    chkGirlfriendBtn.querySelector('span').innerText = '오늘 완료!';
  } else {
    chkGirlfriendBtn.classList.remove('checked');
    chkGirlfriendBtn.querySelector('span').innerText = '오늘 안함';
  }
}

async function toggleTodayWorkout(person) {
  const todayStr = getLocalDateString(new Date());
  const log = monthlyLogs[todayStr] || { me: false, girlfriend: false };
  
  if (person === 'me') {
    log.me = !log.me;
  } else {
    log.girlfriend = !log.girlfriend;
  }

  // Update locally instantly
  monthlyLogs[todayStr] = log;
  updateTodayWidgetState(log.me, log.girlfriend);
  renderCalendar();
  updateStats();

  // Async save to storage
  await saveDayData(todayStr, log.me, log.girlfriend);
}

// Modal Functions
function openDayModal(dateStr, dayLog) {
  activeModalDateStr = dateStr;
  
  // Format title
  const dateObj = new Date(dateStr);
  modalDateTitle.innerText = `${dateObj.getFullYear()}년 ${dateObj.getMonth() + 1}월 ${dateObj.getDate()}일`;

  // Set switches
  modalChkMe.checked = dayLog.me;
  modalChkGirlfriend.checked = dayLog.girlfriend;

  dayModal.classList.remove('hidden');
}

function closeModal() {
  dayModal.classList.add('hidden');
  activeModalDateStr = "";
}

async function saveModalChanges() {
  if (!activeModalDateStr) return;

  const meDone = modalChkMe.checked;
  const girlfriendDone = modalChkGirlfriend.checked;

  showLoading(true);
  await saveDayData(activeModalDateStr, meDone, girlfriendDone);
  
  // Refresh monthly logs locally
  monthlyLogs[activeModalDateStr] = {
    date: activeModalDateStr,
    me: meDone,
    girlfriend: girlfriendDone
  };

  renderCalendar();
  updateStats();
  closeModal();
  showLoading(false);
}

// Stats calculation
function updateStats() {
  let meCount = 0;
  let girlfriendCount = 0;

  Object.values(monthlyLogs).forEach(log => {
    if (log.me) meCount++;
    if (log.girlfriend) girlfriendCount++;
  });

  // Animate counts
  document.getElementById('count-me').innerText = meCount;
  document.getElementById('count-girlfriend').innerText = girlfriendCount;

  // Compute month days to show accurate percentage
  const totalDays = new Date(currentYear, currentMonth + 1, 0).getDate();
  const pctMe = (meCount / totalDays) * 100;
  const pctGirlfriend = (girlfriendCount / totalDays) * 100;

  document.getElementById('bar-me').style.width = `${pctMe}%`;
  document.getElementById('bar-girlfriend').style.width = `${pctGirlfriend}%`;

  // Dynamic cheering messages
  const cheerMsg = document.getElementById('cheer-msg');
  if (meCount > 0 && girlfriendCount > 0) {
    if (Math.abs(meCount - girlfriendCount) <= 2) {
      cheerMsg.innerText = "서로 응원하며 페이스가 아주 잘 맞아요! 💑🔥";
    } else if (meCount > girlfriendCount) {
      cheerMsg.innerText = "나의 페이스에 맞추어 여자친구도 홧팅! 🏋️‍♂️✨";
    } else {
      cheerMsg.innerText = "여자친구의 페이스에 맞추어 나도 홧팅! 🏋️‍♀️✨";
    }
  } else {
    cheerMsg.innerText = "매일 작은 변화가 아름다운 습관을 만듭니다! 💕";
  }
}

// Loading indicator controller
function showLoading(show) {
  if (show) {
    loadingOverlay.classList.remove('hidden');
  } else {
    loadingOverlay.classList.add('hidden');
  }
}

// Theme Toggle Logic
function setupThemeToggle() {
  const btnTheme = document.getElementById('btn-theme');
  const themeIcon = btnTheme.querySelector('i');

  // Check saved theme from localStorage
  if (localStorage.getItem('theme') === 'light') {
    document.body.classList.add('light-theme');
    themeIcon.className = 'fa-solid fa-sun';
  } else {
    document.body.classList.remove('light-theme');
    themeIcon.className = 'fa-solid fa-moon';
  }

  btnTheme.addEventListener('click', () => {
    document.body.classList.toggle('light-theme');
    const isLight = document.body.classList.contains('light-theme');
    localStorage.setItem('theme', isLight ? 'light' : 'dark');
    themeIcon.className = isLight ? 'fa-solid fa-sun' : 'fa-solid fa-moon';
  });
}

// Immediate Setup (Avoid depending on DOMContentLoaded which might have already fired)
setupPasswordGate();
setupThemeToggle();
