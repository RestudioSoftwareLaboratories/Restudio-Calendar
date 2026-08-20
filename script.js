/**
 * 
 * 
 * التحسينات الأمنية المطبقة:
 * 1. تطهير المدخلات (Sanitization) - منع هجمات XSS
 * 2. التحقق من صحة البيانات المستوردة
 * 3. تقييد الأذونات ومنع تنفيذ أكواد ضارة
 * 4. التحقق من الحدود عند الوصول إلى المصفوفات
 * 5. عزل الكود في IIFE
 */

(function() {
    'use strict';

    // ===== أدوات التطهير (Sanitization) =====
    const Sanitizer = {
        /**
         * تطهير النص من أكواد HTML و JavaScript الضارة
         * @param {string} input - النص المدخل
         * @returns {string} - النص المطهر
         */
        sanitizeText: function(input) {
            if (typeof input !== 'string') {
                return '';
            }
            
            // إزالة أي HTML tags
            let sanitized = input.replace(/<[^>]*>/g, '');
            
            // إزالة أي أكواد JavaScript
            sanitized = sanitized.replace(/javascript:/gi, '');
            sanitized = sanitized.replace(/on\w+\s*=/gi, '');
            sanitized = sanitized.replace(/eval\s*\(/gi, '');
            sanitized = sanitized.replace(/document\./gi, '');
            sanitized = sanitized.replace(/window\./gi, '');
            sanitized = sanitized.replace(/alert\s*\(/gi, '');
            sanitized = sanitized.replace(/console\./gi, '');
            
            // إزالة الأحرف الخطرة
            sanitized = sanitized.replace(/[<>]/g, '');
            
            // قص النص إلى الحد الأقصى المسموح
            const MAX_LENGTH = 30;
            if (sanitized.length > MAX_LENGTH) {
                sanitized = sanitized.substring(0, MAX_LENGTH);
            }
            
            return sanitized.trim();
        },

        /**
         * التحقق من صحة تاريخ
         * @param {Date} date - التاريخ المراد التحقق منه
         * @returns {boolean} - صحيح إذا كان التاريخ صالحاً
         */
        isValidDate: function(date) {
            return date instanceof Date && !isNaN(date.getTime());
        },

        /**
         * التحقق من صحة مفتاح التاريخ
         * @param {string} key - مفتاح التاريخ بصيغة YYYY-MM-DD
         * @returns {boolean} - صحيح إذا كان المفتاح صالحاً
         */
        isValidDateKey: function(key) {
            if (typeof key !== 'string') return false;
            
            const parts = key.split('-');
            if (parts.length !== 3) return false;
            
            const year = parseInt(parts[0]);
            const month = parseInt(parts[1]) - 1;
            const day = parseInt(parts[2]);
            
            if (isNaN(year) || isNaN(month) || isNaN(day)) return false;
            if (year < 1900 || year > 2100) return false;
            if (month < 0 || month > 11) return false;
            if (day < 1 || day > 31) return false;
            
            const date = new Date(year, month, day);
            return date.getFullYear() === year && 
                   date.getMonth() === month && 
                   date.getDate() === day;
        },

        /**
         * التحقق من أن القيمة عدد صحيح ضمن النطاق المسموح
         * @param {*} value - القيمة المراد التحقق منها
         * @param {number} min - الحد الأدنى
         * @param {number} max - الحد الأقصى
         * @param {number} fallback - القيمة الافتراضية
         * @returns {number} - القيمة الصحيحة أو القيمة الافتراضية
         */
        validateInteger: function(value, min, max, fallback) {
            const num = Number(value);
            if (!Number.isInteger(num) || num < min || num > max) {
                return fallback;
            }
            return num;
        }
    };

    // ===== إدارة الأحداث مع التحقق من الأمان =====
    let events = {};
    let currentView = 'day';
    let currentDate = new Date();
    let currentYear = currentDate.getFullYear();
    let currentMonth = currentDate.getMonth();
    let currentDay = currentDate.getDate();
    let weekStartDate = new Date(currentDate);
    weekStartDate.setDate(currentDate.getDate() - currentDate.getDay());
    let datepicker = null;

    const today = new Date();
    const todayDate = today.getDate();
    const todayMonth = today.getMonth();
    const todayYear = today.getFullYear();

    const monthNames = [
        'January', 'February', 'March', 'April',
        'May', 'June', 'July', 'August',
        'September', 'October', 'November', 'December'
    ];
    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const shortDayNames = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

    // ===== تحميل وحفظ الأحداث مع التحقق من الأمان =====
    function loadEvents() {
        try {
            const stored = localStorage.getItem('calendar_events');
            if (!stored) {
                events = {};
                return;
            }

            const parsed = JSON.parse(stored);
            
            // التحقق من صحة البيانات المستوردة
            if (typeof parsed !== 'object' || parsed === null) {
                events = {};
                return;
            }

            events = {};
            for (const [key, value] of Object.entries(parsed)) {
                // التحقق من صحة مفتاح التاريخ
                if (!Sanitizer.isValidDateKey(key)) continue;
                
                // التحقق من أن القيمة مصفوفة
                if (!Array.isArray(value)) continue;
                
                // تطهير كل حدث
                const sanitizedEvents = value
                    .filter(text => typeof text === 'string')
                    .map(text => Sanitizer.sanitizeText(text))
                    .filter(text => text.length > 0);
                
                if (sanitizedEvents.length > 0) {
                    events[key] = sanitizedEvents;
                }
            }
        } catch (e) {
            // في حالة حدوث خطأ، نبدأ ببيانات فارغة
            events = {};
        }
    }

    function saveEvents() {
        try {
            localStorage.setItem('calendar_events', JSON.stringify(events));
        } catch (e) {
            // تجاهل أخطاء التخزين
        }
    }

    // ===== دوال مساعدة مع التحقق من الحدود =====
    function getDateKey(date) {
        if (!Sanitizer.isValidDate(date)) {
            return '';
        }
        const y = date.getFullYear();
        const m = String(date.getMonth() + 1).padStart(2, '0');
        const d = String(date.getDate()).padStart(2, '0');
        return `${y}-${m}-${d}`;
    }

    function getEventsForDate(date) {
        if (!Sanitizer.isValidDate(date)) {
            return [];
        }
        const key = getDateKey(date);
        if (!key) return [];
        return events[key] || [];
    }

    function addEvent(date, text) {
        if (!Sanitizer.isValidDate(date)) {
            return false;
        }
        
        const sanitizedText = Sanitizer.sanitizeText(text);
        if (!sanitizedText) {
            return false;
        }

        const key = getDateKey(date);
        if (!key) return false;

        if (!events[key]) {
            events[key] = [];
        }

        // التحقق من عدم وجود تكرار
        if (events[key].includes(sanitizedText)) {
            return false;
        }

        events[key].push(sanitizedText);
        saveEvents();
        renderView();
        if (datepicker) {
            datepicker.update();
        }
        return true;
    }

    function deleteEvent(date, index) {
        if (!Sanitizer.isValidDate(date)) {
            return;
        }

        const key = getDateKey(date);
        if (!key) return;

        if (events[key] && Array.isArray(events[key])) {
            // التحقق من أن الفهرس ضمن الحدود
            if (index >= 0 && index < events[key].length) {
                events[key].splice(index, 1);
                if (events[key].length === 0) {
                    delete events[key];
                }
                saveEvents();
                renderView();
                if (datepicker) {
                    datepicker.update();
                }
            }
        }
    }

    function isSameDay(d1, d2) {
        if (!Sanitizer.isValidDate(d1) || !Sanitizer.isValidDate(d2)) {
            return false;
        }
        return d1.getFullYear() === d2.getFullYear() &&
            d1.getMonth() === d2.getMonth() &&
            d1.getDate() === d2.getDate();
    }

    function addDays(date, days) {
        if (!Sanitizer.isValidDate(date)) {
            return new Date();
        }
        const result = new Date(date);
        result.setDate(result.getDate() + days);
        return result;
    }

    function addWeeks(date, weeks) {
        return addDays(date, weeks * 7);
    }

    function startOfWeek(date) {
        if (!Sanitizer.isValidDate(date)) {
            return new Date();
        }
        const result = new Date(date);
        result.setDate(result.getDate() - result.getDay());
        return result;
    }

    function formatDate(date) {
        if (!Sanitizer.isValidDate(date)) {
            return '';
        }
        return `${monthNames[date.getMonth()]} ${date.getDate()}, ${date.getFullYear()}`;
    }

    function formatDateShort(date) {
        if (!Sanitizer.isValidDate(date)) {
            return '';
        }
        return `${monthNames[date.getMonth()]} ${date.getDate()}`;
    }

    // ===== دوال العرض =====
    function renderMonthView(year, month) {
        const grid = document.getElementById('daysGrid');
        if (!grid) return;

        const firstDay = new Date(year, month, 1);
        const daysInMonth = new Date(year, month + 1, 0).getDate();
        let startDay = firstDay.getDay();
        const prevMonthDays = new Date(year, month, 0).getDate();
        const totalCells = 42;
        let html = '';

        for (let i = 0; i < totalCells; i++) {
            let d, isCurrentMonth = true;
            let dayNumber, dayMonth = month,
                dayYear = year;

            if (i < startDay) {
                dayNumber = prevMonthDays - startDay + i + 1;
                isCurrentMonth = false;
                dayMonth = month - 1;
                if (dayMonth < 0) { dayMonth = 11;
                    dayYear = year - 1; }
            } else if (i >= startDay + daysInMonth) {
                dayNumber = i - (startDay + daysInMonth) + 1;
                isCurrentMonth = false;
                dayMonth = month + 1;
                if (dayMonth > 11) { dayMonth = 0;
                    dayYear = year + 1; }
            } else {
                dayNumber = i - startDay + 1;
            }

            d = new Date(dayYear, dayMonth, dayNumber);
            const isToday = isSameDay(d, today);
            const dayEvents = getEventsForDate(d);
            const hasEvent = dayEvents.length > 0;

            let classes = 'day-cell';
            if (!isCurrentMonth) classes += ' empty';
            if (isToday) classes += ' today';

            html += `<div class="${classes}" data-year="${dayYear}" data-month="${dayMonth}" data-day="${dayNumber}">
                        <span>${dayNumber}</span>`;
            if (hasEvent && isCurrentMonth) {
                html += `<div class="event-dot"></div>`;
                if (dayEvents.length > 1) {
                    html += `<span class="event-count">${dayEvents.length}</span>`;
                }
            }
            html += `</div>`;
        }

        grid.innerHTML = html;

        grid.querySelectorAll('.day-cell:not(.empty)').forEach(cell => {
            cell.addEventListener('click', function() {
                const year = Sanitizer.validateInteger(this.dataset.year, 1900, 2100, currentYear);
                const month = Sanitizer.validateInteger(this.dataset.month, 0, 11, currentMonth);
                const day = Sanitizer.validateInteger(this.dataset.day, 1, 31, currentDay);
                currentDate = new Date(year, month, day);
                currentYear = year;
                currentMonth = month;
                currentDay = day;
                switchView('day');
            });
        });
    }

    function renderWeekView(startDate) {
        const grid = document.getElementById('weekGrid');
        if (!grid) return;

        let html = '';
        const weekStart = new Date(startDate);

        for (let i = 0; i < 7; i++) {
            const d = new Date(weekStart);
            d.setDate(weekStart.getDate() + i);
            const isToday = isSameDay(d, today);
            const dayEvents = getEventsForDate(d);

            html += `<div class="week-day" data-year="${d.getFullYear()}" data-month="${d.getMonth()}" data-day="${d.getDate()}">
                        <div class="week-day-label">${shortDayNames[i]}</div>
                        <div class="week-day-number${isToday ? ' today' : ''}">${d.getDate()}</div>`;

            const maxDisplay = 3;
            const displayEvents = dayEvents.slice(0, maxDisplay);
            displayEvents.forEach(text => {
                const safeText = Sanitizer.sanitizeText(text);
                html += `<div class="week-event">${safeText}</div>`;
            });
            if (dayEvents.length > maxDisplay) {
                html += `<div class="week-event more">+${dayEvents.length - maxDisplay} more</div>`;
            }

            html += `</div>`;
        }

        grid.innerHTML = html;

        grid.querySelectorAll('.week-day').forEach(el => {
            el.addEventListener('click', function() {
                const year = Sanitizer.validateInteger(this.dataset.year, 1900, 2100, currentYear);
                const month = Sanitizer.validateInteger(this.dataset.month, 0, 11, currentMonth);
                const day = Sanitizer.validateInteger(this.dataset.day, 1, 31, currentDay);
                currentDate = new Date(year, month, day);
                currentYear = year;
                currentMonth = month;
                currentDay = day;
                switchView('day');
            });
        });
    }

    function renderDayView(date) {
        if (!Sanitizer.isValidDate(date)) {
            date = new Date();
        }

        document.getElementById('dayViewDayName').textContent = dayNames[date.getDay()];
        document.getElementById('dayViewDate').textContent = formatDate(date);

        const dayEvents = getEventsForDate(date);
        document.getElementById('dayViewEventCount').textContent = `${dayEvents.length} events`;

        const list = document.getElementById('dayEventsList');
        if (dayEvents.length === 0) {
            list.innerHTML = `<div class="no-events"><i class="ti ti-calendar-off"></i> No events on this day</div>`;
        } else {
            let html = '';
            dayEvents.forEach((text, index) => {
                const safeText = Sanitizer.sanitizeText(text);
                html += `
                            <div class="event-item">
                                <span class="event-text">
                                    <i class="ti ti-circle-filled"></i>
                                    ${safeText}
                                </span>
                                <button class="delete-btn" data-index="${index}">
                                    <i class="ti ti-x"></i>
                                </button>
                            </div>
                        `;
            });
            list.innerHTML = html;

            list.querySelectorAll('.delete-btn').forEach(btn => {
                btn.addEventListener('click', function() {
                    const idx = Sanitizer.validateInteger(this.dataset.index, 0, 100, 0);
                    deleteEvent(date, idx);
                });
            });
        }

        renderEventList(date);
    }

    function renderYearView(year) {
        const grid = document.getElementById('yearGrid');
        if (!grid) return;

        let html = '';

        for (let m = 0; m < 12; m++) {
            const daysInMonth = new Date(year, m + 1, 0).getDate();
            const firstDay = new Date(year, m, 1).getDay();

            html += `<div class="year-month">
                        <div class="year-month-label">${monthNames[m]}</div>
                        <div class="year-month-grid">`;

            for (let i = 0; i < firstDay; i++) {
                html += `<div class="year-day empty"></div>`;
            }

            for (let d = 1; d <= daysInMonth; d++) {
                const dateObj = new Date(year, m, d);
                const isToday = isSameDay(dateObj, today);
                const dayEvents = getEventsForDate(dateObj);
                const hasEvent = dayEvents.length > 0;
                const isWeekend = dateObj.getDay() === 0 || dateObj.getDay() === 6;

                let classes = 'year-day';
                if (isToday) classes += ' today';
                if (hasEvent) classes += ' has-event';
                if (isWeekend && !hasEvent && !isToday) classes += ' weekend';

                html += `<div class="${classes}">${d}</div>`;
            }

            html += `</div></div>`;
        }

        grid.innerHTML = html;
    }

    function renderEventList(date) {
        const eventList = document.getElementById('eventList');
        if (!eventList) return;

        if (date && Sanitizer.isValidDate(date)) {
            const dayEvents = getEventsForDate(date);
            if (dayEvents.length === 0) {
                eventList.innerHTML = `
                            <div class="no-events-msg">
                                <i class="ti ti-calendar-off"></i>
                                No events on ${formatDate(date)}
                            </div>
                        `;
                return;
            }

            let html = `
                        <div class="selected-date-label">
                            <i class="ti ti-calendar-event"></i> ${formatDate(date)}
                        </div>
                    `;
            dayEvents.forEach((text, index) => {
                const safeText = Sanitizer.sanitizeText(text);
                html += `
                            <div class="event-item">
                                <span class="event-text">
                                    <i class="ti ti-circle-filled"></i>
                                    ${safeText}
                                </span>
                                <button class="delete-btn" data-index="${index}">
                                    <i class="ti ti-x"></i>
                                </button>
                            </div>
                        `;
            });
            eventList.innerHTML = html;

            eventList.querySelectorAll('.delete-btn').forEach(btn => {
                btn.addEventListener('click', function() {
                    const idx = Sanitizer.validateInteger(this.dataset.index, 0, 100, 0);
                    deleteEvent(date, idx);
                });
            });
        } else {
            const allKeys = Object.keys(events);
            if (allKeys.length === 0) {
                eventList.innerHTML = `
                            <div class="no-events-msg">
                                <i class="ti ti-calendar-off"></i>
                                No events yet
                            </div>
                        `;
                return;
            }

            allKeys.sort();
            let html = `<div class="selected-date-label"><i class="ti ti-list"></i> All Events</div>`;
            let hasEvents = false;
            
            allKeys.forEach(key => {
                const dayEvents = events[key];
                if (!Array.isArray(dayEvents) || dayEvents.length === 0) return;
                
                const parts = key.split('-').map(Number);
                if (parts.length !== 3) return;
                
                const d = new Date(parts[0], parts[1] - 1, parts[2]);
                if (!Sanitizer.isValidDate(d)) return;
                
                hasEvents = true;
                html += `<div style="font-size:0.75rem;color:#aaa;margin-top:8px;margin-bottom:2px;">
                            <i class="ti ti-calendar-dot"></i> ${formatDate(d)}
                        </div>`;
                dayEvents.forEach((text, index) => {
                    const safeText = Sanitizer.sanitizeText(text);
                    html += `
                                <div class="event-item">
                                    <span class="event-text">
                                        <i class="ti ti-circle-filled" style="font-size:0.5rem;"></i>
                                        ${safeText}
                                    </span>
                                    <button class="delete-btn" data-key="${key}" data-index="${index}">
                                        <i class="ti ti-x"></i>
                                    </button>
                                </div>
                            `;
                });
            });

            if (!hasEvents) {
                html = `<div class="no-events-msg"><i class="ti ti-calendar-off"></i> No events yet</div>`;
            }
            eventList.innerHTML = html;

            eventList.querySelectorAll('.delete-btn').forEach(btn => {
                btn.addEventListener('click', function() {
                    const key = this.dataset.key;
                    const idx = Sanitizer.validateInteger(this.dataset.index, 0, 100, 0);
                    if (!key || !Sanitizer.isValidDateKey(key)) return;
                    
                    const parts = key.split('-').map(Number);
                    const d = new Date(parts[0], parts[1] - 1, parts[2]);
                    deleteEvent(d, idx);
                });
            });
        }
    }

    function switchView(view) {
        const validViews = ['day', 'week', 'month', 'year'];
        if (!validViews.includes(view)) {
            view = 'day';
        }
        
        currentView = view;

        document.querySelectorAll('.view-toggle button').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.view === view);
        });

        document.getElementById('monthView').classList.add('view-hidden');
        document.getElementById('weekView').classList.add('view-hidden');
        document.getElementById('dayView').classList.add('view-hidden');
        document.getElementById('yearView').classList.add('view-hidden');

        const viewMap = {
            'month': 'monthView',
            'week': 'weekView',
            'day': 'dayView',
            'year': 'yearView'
        };
        document.getElementById(viewMap[view]).classList.remove('view-hidden');

        updateHeader();
        renderView();
    }

    function renderView() {
        if (currentView === 'month') {
            renderMonthView(currentYear, currentMonth);
        } else if (currentView === 'week') {
            renderWeekView(weekStartDate);
        } else if (currentView === 'day') {
            renderDayView(currentDate);
        } else if (currentView === 'year') {
            renderYearView(currentYear);
        }
        if (currentView !== 'day') {
            renderEventList();
        }
    }

    function updateHeader() {
        if (currentView === 'day') {
            document.getElementById('monthYearDisplay').textContent = formatDate(currentDate);
        } else if (currentView === 'week') {
            const weekEnd = new Date(weekStartDate);
            weekEnd.setDate(weekStartDate.getDate() + 6);
            document.getElementById('monthYearDisplay').textContent =
                `${formatDateShort(weekStartDate)} - ${formatDate(weekEnd)}`;
        } else if (currentView === 'year') {
            document.getElementById('monthYearDisplay').textContent = `${currentYear}`;
        } else {
            document.getElementById('monthYearDisplay').textContent =
                `${monthNames[currentMonth]} ${currentYear}`;
        }
    }

    function navigate(delta) {
        delta = Sanitizer.validateInteger(delta, -12, 12, 1);
        
        if (currentView === 'month') {
            const newDate = new Date(currentYear, currentMonth + delta, 1);
            currentYear = newDate.getFullYear();
            currentMonth = newDate.getMonth();
            currentDate = new Date(currentYear, currentMonth, 1);
        } else if (currentView === 'week') {
            weekStartDate = addWeeks(weekStartDate, delta);
            currentDate = new Date(weekStartDate);
            currentYear = currentDate.getFullYear();
            currentMonth = currentDate.getMonth();
        } else if (currentView === 'day') {
            currentDate = addDays(currentDate, delta);
            currentYear = currentDate.getFullYear();
            currentMonth = currentDate.getMonth();
            currentDay = currentDate.getDate();
        } else if (currentView === 'year') {
            currentYear = Sanitizer.validateInteger(currentYear + delta, 1900, 2100, 2024);
        }
        updateHeader();
        renderView();
    }

    function goToToday() {
        const now = new Date();
        currentDate = now;
        currentYear = now.getFullYear();
        currentMonth = now.getMonth();
        currentDay = now.getDate();
        weekStartDate = startOfWeek(now);
        updateHeader();
        renderView();
        if (datepicker) {
            datepicker.selectDate(currentDate);
        }
    }

    // ===== تهيئة الـ Datepicker =====
    function initDatepicker() {
        const input = document.getElementById('eventDateInput');
        if (!input) return;

        datepicker = new AirDatepicker(input, {
            locale: {
                days: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
                daysShort: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
                daysMin: ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'],
                months: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September',
                    'October', 'November', 'December'
                ],
                monthsShort: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov',
                    'Dec'
                ],
                today: 'Today',
                clear: 'Clear',
                dateFormat: 'MM dd, yyyy',
                timeFormat: 'hh:mm aa',
                firstDay: 0
            },
            selectedDates: [currentDate],
            onSelect: function({ date }) {
                if (date) {
                    const d = new Date(date);
                    if (Sanitizer.isValidDate(d)) {
                        currentDate = d;
                        currentYear = d.getFullYear();
                        currentMonth = d.getMonth();
                        currentDay = d.getDate();
                        renderView();
                        updateHeader();
                    }
                }
            },
            onRenderCell: function({ date, cellType }) {
                if (cellType === 'day') {
                    const d = new Date(date);
                    const dayEvents = getEventsForDate(d);
                    if (dayEvents.length > 0) {
                        return {
                            html: `<span class="air-datepicker-event-dot"></span>`
                        };
                    }
                }
            }
        });

        setTimeout(() => {
            if (datepicker) {
                datepicker.selectDate(currentDate);
            }
        }, 100);
    }

    // ===== تهيئة الأحداث =====
    function init() {
        loadEvents();

        document.querySelectorAll('.view-toggle button').forEach(btn => {
            btn.addEventListener('click', function() {
                switchView(this.dataset.view);
            });
        });

        document.getElementById('prevBtn').addEventListener('click', () => navigate(-1));
        document.getElementById('nextBtn').addEventListener('click', () => navigate(1));
        document.getElementById('todayBtn').addEventListener('click', goToToday);

        document.getElementById('addEventBtn').addEventListener('click', function() {
            const dateInput = document.getElementById('eventDateInput');
            const textInput = document.getElementById('eventTextInput');

            if (!dateInput || !textInput) return;

            if (!dateInput.value) {
                alert('Please select a date');
                return;
            }
            if (!textInput.value.trim()) {
                alert('Please enter an event name');
                return;
            }

            const selectedDate = datepicker ? datepicker.selectedDates[0] : currentDate;
            const d = new Date(selectedDate);

            if (addEvent(d, textInput.value)) {
                textInput.value = '';
                if (datepicker) {
                    datepicker.update();
                }
            } else {
                alert('Failed to add event. Please check the input.');
            }
        });

        document.getElementById('eventTextInput').addEventListener('keypress', function(e) {
            if (e.key === 'Enter') {
                document.getElementById('addEventBtn').click();
            }
        });

        initDatepicker();
        switchView('day');
    }

    // ===== بدء التشغيل =====
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

})();
