// ========== SECURITY UTILITIES ==========

function sanitizeText(text) {
    if (text === null || text === undefined) return '';
    if (typeof text !== 'string') return String(text);
    var map = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#x27;',
        '/': '&#x2F;',
        '=': '&#x3D;',
        '`': '&#x60;'
    };
    return text.replace(/[&<>"'/=`]/g, function(match) { return map[match]; });
}

function isValidText(text) {
    if (typeof text !== 'string') return false;
    var dangerousPatterns = [
        /javascript:/i, /on\w+\s*=/i, /<script/i, /<iframe/i,
        /<object/i, /<embed/i, /data:text\/html/i, /vbscript:/i
    ];
    for (var i = 0; i < dangerousPatterns.length; i++) {
        if (dangerousPatterns[i].test(text)) return false;
    }
    return true;
}

function validateEventText(text) {
    if (typeof text !== 'string') return false;
    var trimmed = text.trim();
    if (trimmed.length === 0) return false;
    if (trimmed.length > 30) return false;
    if (!isValidText(trimmed)) return false;
    return true;
}

function validateDate(date) {
    if (!(date instanceof Date)) return false;
    if (isNaN(date.getTime())) return false;
    return true;
}

function validateTime(time) {
    if (typeof time !== 'string') return false;
    return /^([0-1][0-9]|2[0-3]):[0-5][0-9]$/.test(time);
}

function validateStoredEvents(data) {
    if (typeof data !== 'object' || data === null) return false;
    for (var key in data) {
        if (data.hasOwnProperty(key)) {
            if (typeof key !== 'string') return false;
            var dateRegex = /^\d{4}-\d{2}-\d{2}$/;
            if (!dateRegex.test(key)) return false;
            if (!Array.isArray(data[key])) return false;
            for (var i = 0; i < data[key].length; i++) {
                var ev = data[key][i];
                if (typeof ev === 'string') {
                    // Old format - convert
                    continue;
                }
                if (typeof ev !== 'object') return false;
                if (typeof ev.text !== 'string') return false;
                if (!isValidText(ev.text)) return false;
            }
        }
    }
    return true;
}

// ========== MAIN APPLICATION ==========

(function() {
    'use strict';
    
    var currentView = 'day';
    var currentDate = new Date();
    var currentYear = currentDate.getFullYear();
    var currentMonth = currentDate.getMonth();
    var currentDay = currentDate.getDate();
    var weekStartDate = new Date(currentDate);
    weekStartDate.setDate(currentDate.getDate() - currentDate.getDay());

    var today = new Date();
    var monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    var dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    var shortDayNames = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

    var events = {};
    var datepicker = null;
    var timePickerStart = null;
    var timePickerEnd = null;
    var hasUnsavedChanges = false;
    var editingEventKey = null;
    var editingEventIndex = null;
    var holidayData = {};

    // ============ HOLIDAYS ============
    var holidays = {
        '2026-01-01': { name: 'New Year\'s Day', type: 'public' },
        '2026-12-25': { name: 'Christmas Day', type: 'public' },
        '2026-07-04': { name: 'Independence Day', type: 'public' },
        '2026-11-26': { name: 'Thanksgiving', type: 'public' },
        // Add more holidays as needed
    };

    function getHolidaysForDate(date) {
        var key = getDateKey(date);
        return holidays[key] || null;
    }

    function isHoliday(date) {
        var key = getDateKey(date);
        return !!holidays[key];
    }

    // ============ WEEK NUMBER ============
    function getWeekNumber(date) {
        var d = new Date(date);
        d.setHours(0, 0, 0, 0);
        d.setDate(d.getDate() + 3 - (d.getDay() + 6) % 7);
        var week1 = new Date(d.getFullYear(), 0, 4);
        return 1 + Math.round(((d - week1) / 86400000 - 3 + (week1.getDay() + 6) % 7) / 7);
    }

    // ============ DATA MANAGEMENT ============
    function loadEvents() {
        try {
            var stored = localStorage.getItem('calendar_events_v2');
            if (stored) {
                var parsed = JSON.parse(stored);
                if (validateStoredEvents(parsed)) {
                    events = parsed;
                } else {
                    console.warn('Invalid events data, resetting.');
                    events = {};
                }
            }
        } catch (e) {
            console.warn('Failed to load events.', e);
            events = {};
        }
        clearUnsaved();
    }

    function saveEvents() {
        try {
            localStorage.setItem('calendar_events_v2', JSON.stringify(events));
            clearUnsaved();
        } catch (e) {
            console.warn('Failed to save events.', e);
        }
    }

    function getDateKey(date) {
        if (!validateDate(date)) return '';
        var y = date.getFullYear();
        var m = String(date.getMonth() + 1).padStart(2, '0');
        var d = String(date.getDate()).padStart(2, '0');
        return y + '-' + m + '-' + d;
    }

    function getEventsForDate(date) {
        if (!validateDate(date)) return [];
        var key = getDateKey(date);
        var result = [];
        if (events[key]) {
            for (var i = 0; i < events[key].length; i++) {
                var ev = events[key][i];
                if (typeof ev === 'string') {
                    // Old format - convert
                    ev = { text: ev, color: '#4c9aff', time: '09:00', endTime: '10:00', repeat: 'none', repeatEnd: null };
                    events[key][i] = ev;
                }
                result.push(ev);
            }
        }
        return result;
    }

    function getEventObject(date, index) {
        var key = getDateKey(date);
        if (events[key] && index >= 0 && index < events[key].length) {
            return events[key][index];
        }
        return null;
    }

    function addEvent(date, text, color, startTime, endTime, repeat, repeatEnd, notify) {
        if (!validateDate(date)) return false;
        var sanitizedText = sanitizeText(text.trim());
        if (!validateEventText(sanitizedText)) return false;
        if (!validateTime(startTime)) startTime = '09:00';
        if (!validateTime(endTime)) endTime = '10:00';
        
        var key = getDateKey(date);
        if (!events[key]) {
            events[key] = [];
        }
        var eventObj = {
            text: sanitizedText,
            color: color || '#4c9aff',
            time: startTime || '09:00',
            endTime: endTime || '10:00',
            repeat: repeat || 'none',
            repeatEnd: repeatEnd || null,
            notify: notify || 0,
            id: Date.now() + '_' + Math.random().toString(36).substr(2, 4)
        };
        events[key].push(eventObj);
        saveEvents();
        markAsChanged();
        renderView();
        if (datepicker) datepicker.update();
        return true;
    }

    function deleteEvent(date, index) {
        if (!validateDate(date)) return;
        var key = getDateKey(date);
        if (events[key] && index >= 0 && index < events[key].length) {
            events[key].splice(index, 1);
            if (events[key].length === 0) {
                delete events[key];
            }
            saveEvents();
            markAsChanged();
            renderView();
            if (datepicker) datepicker.update();
        }
    }

    function updateEvent(date, index, newText, newColor, newStartTime, newEndTime) {
        if (!validateDate(date)) return;
        var key = getDateKey(date);
        if (events[key] && index >= 0 && index < events[key].length) {
            var ev = events[key][index];
            if (newText && validateEventText(newText)) ev.text = sanitizeText(newText.trim());
            if (newColor) ev.color = newColor;
            if (newStartTime && validateTime(newStartTime)) ev.time = newStartTime;
            if (newEndTime && validateTime(newEndTime)) ev.endTime = newEndTime;
            saveEvents();
            markAsChanged();
            renderView();
            if (datepicker) datepicker.update();
        }
    }

    // ============ REPEATING EVENTS ============
    function getRepeatedDates(event, startDate) {
        if (!event.repeat || event.repeat === 'none') return [startDate];
        var dates = [];
        var maxDates = 365;
        var endDate = event.repeatEnd ? new Date(event.repeatEnd) : new Date();
        endDate.setFullYear(endDate.getFullYear() + 1);
        
        var current = new Date(startDate);
        for (var i = 0; i < maxDates; i++) {
            if (current > endDate) break;
            dates.push(new Date(current));
            if (event.repeat === 'daily') {
                current.setDate(current.getDate() + 1);
            } else if (event.repeat === 'weekly') {
                current.setDate(current.getDate() + 7);
            } else if (event.repeat === 'monthly') {
                current.setMonth(current.getMonth() + 1);
            } else if (event.repeat === 'yearly') {
                current.setFullYear(current.getFullYear() + 1);
            }
        }
        return dates;
    }

    function getAllEventsForDate(date) {
        if (!validateDate(date)) return [];
        var key = getDateKey(date);
        var result = [];
        // Check stored events
        if (events[key]) {
            for (var i = 0; i < events[key].length; i++) {
                var ev = events[key][i];
                if (typeof ev === 'string') {
                    ev = { text: ev, color: '#4c9aff', time: '09:00', endTime: '10:00', repeat: 'none', repeatEnd: null };
                    events[key][i] = ev;
                }
                result.push({ event: ev, index: i, isRepeated: false });
            }
        }
        // Check repeating events from other dates
        for (var otherKey in events) {
            if (otherKey === key) continue;
            var otherDateParts = otherKey.split('-').map(Number);
            var otherDate = new Date(otherDateParts[0], otherDateParts[1] - 1, otherDateParts[2]);
            for (var j = 0; j < events[otherKey].length; j++) {
                var ev2 = events[otherKey][j];
                if (typeof ev2 === 'string') {
                    ev2 = { text: ev2, color: '#4c9aff', time: '09:00', endTime: '10:00', repeat: 'none', repeatEnd: null };
                    events[otherKey][j] = ev2;
                }
                if (ev2.repeat && ev2.repeat !== 'none') {
                    var repeatedDates = getRepeatedDates(ev2, otherDate);
                    for (var r = 0; r < repeatedDates.length; r++) {
                        if (isSameDay(repeatedDates[r], date)) {
                            result.push({ event: ev2, index: j, isRepeated: true, sourceKey: otherKey });
                            break;
                        }
                    }
                }
            }
        }
        // Sort by time
        result.sort(function(a, b) {
            return (a.event.time || '09:00').localeCompare(b.event.time || '09:00');
        });
        return result;
    }

    // ============ DATE HELPERS ============
    function isSameDay(d1, d2) {
        if (!validateDate(d1) || !validateDate(d2)) return false;
        return d1.getFullYear() === d2.getFullYear() &&
            d1.getMonth() === d2.getMonth() &&
            d1.getDate() === d2.getDate();
    }

    function addDays(date, days) {
        if (!validateDate(date)) return new Date();
        var result = new Date(date);
        result.setDate(result.getDate() + days);
        return result;
    }

    function addWeeks(date, weeks) {
        return addDays(date, weeks * 7);
    }

    function startOfWeek(date) {
        if (!validateDate(date)) return new Date();
        var result = new Date(date);
        result.setDate(result.getDate() - result.getDay());
        return result;
    }

    function formatDate(date) {
        if (!validateDate(date)) return '';
        return monthNames[date.getMonth()] + ' ' + date.getDate() + ', ' + date.getFullYear();
    }

    function formatDateShort(date) {
        if (!validateDate(date)) return '';
        return monthNames[date.getMonth()] + ' ' + date.getDate();
    }

    function formatTime(time) {
        if (!time) return '';
        var parts = time.split(':');
        var h = parseInt(parts[0]);
        var ampm = h >= 12 ? 'PM' : 'AM';
        h = h % 12 || 12;
        return h + ':' + parts[1] + ' ' + ampm;
    }

    // ============ NOTIFICATIONS ============
    function requestNotificationPermission() {
        if ('Notification' in window) {
            if (Notification.permission === 'default') {
                Notification.requestPermission();
            }
        }
    }

    function sendNotification(title, body, delay) {
        if ('Notification' in window && Notification.permission === 'granted') {
            setTimeout(function() {
                try {
                    var notif = new Notification(title, {
                        body: body,
                        icon: 'https://i.postimg.cc/LXvCQ5rt/swrh-restudio.png'
                    });
                    setTimeout(function() { notif.close(); }, 5000);
                } catch (e) {
                    console.warn('Notification failed:', e);
                }
            }, delay || 0);
        }
    }

    function scheduleNotifications() {
        var now = new Date();
        for (var key in events) {
            var parts = key.split('-').map(Number);
            var date = new Date(parts[0], parts[1] - 1, parts[2]);
            for (var i = 0; i < events[key].length; i++) {
                var ev = events[key][i];
                if (typeof ev === 'string') {
                    ev = { text: ev, color: '#4c9aff', time: '09:00', endTime: '10:00', repeat: 'none', repeatEnd: null, notify: 0 };
                    events[key][i] = ev;
                }
                if (ev.notify && ev.notify > 0) {
                    var eventDate = new Date(date);
                    var timeParts = (ev.time || '09:00').split(':');
                    eventDate.setHours(parseInt(timeParts[0]), parseInt(timeParts[1]), 0, 0);
                    var diff = (eventDate - now) / 60000;
                    if (diff > 0 && diff <= ev.notify + 5) {
                        var delay = Math.max(0, (diff - ev.notify) * 60000);
                        sendNotification('Event Reminder: ' + ev.text, 'Starts at ' + formatTime(ev.time), delay);
                    }
                }
            }
        }
    }

    // ============ SEARCH & FILTER ============
    var searchQuery = '';
    var colorFilter = 'all';

    window.filterEvents = function(query, color) {
        if (query !== undefined) searchQuery = query;
        if (color !== undefined) colorFilter = color;
        renderView();
    };

    window.clearSearch = function() {
        searchQuery = '';
        colorFilter = 'all';
        document.getElementById('searchInput').value = '';
        document.getElementById('colorFilter').value = 'all';
        renderView();
    };

    function shouldShowEvent(event, date) {
        if (searchQuery) {
            var q = searchQuery.toLowerCase();
            if (event.text.toLowerCase().indexOf(q) === -1) return false;
        }
        if (colorFilter !== 'all' && event.color !== colorFilter) return false;
        return true;
    }

    // ============ RENDER FUNCTIONS ============
    function renderMonthView(year, month) {
        var grid = document.getElementById('daysGrid');
        var firstDay = new Date(year, month, 1);
        var daysInMonth = new Date(year, month + 1, 0).getDate();
        var startDay = firstDay.getDay();
        var prevMonthDays = new Date(year, month, 0).getDate();
        var totalCells = 42;
        var html = '';

        for (var i = 0; i < totalCells; i++) {
            var d, isCurrentMonth = true;
            var dayNumber, dayMonth = month, dayYear = year;

            if (i < startDay) {
                dayNumber = prevMonthDays - startDay + i + 1;
                isCurrentMonth = false;
                dayMonth = month - 1;
                if (dayMonth < 0) { dayMonth = 11; dayYear = year - 1; }
            } else if (i >= startDay + daysInMonth) {
                dayNumber = i - (startDay + daysInMonth) + 1;
                isCurrentMonth = false;
                dayMonth = month + 1;
                if (dayMonth > 11) { dayMonth = 0; dayYear = year + 1; }
            } else {
                dayNumber = i - startDay + 1;
            }

            d = new Date(dayYear, dayMonth, dayNumber);
            var isToday = isSameDay(d, today);
            var dayEvents = getAllEventsForDate(d);
            var hasEvent = dayEvents.length > 0;
            var isHolidayDay = isHoliday(d);
            var holidayInfo = getHolidaysForDate(d);

            var classes = 'day-cell';
            if (!isCurrentMonth) classes += ' empty';
            if (isToday) classes += ' today';
            if (isHolidayDay) classes += ' holiday';

            html += '<div class="' + classes + '" data-year="' + dayYear + '" data-month="' + dayMonth + '" data-day="' + dayNumber + '">' +
                '<span>' + dayNumber + '</span>';
            if (isHolidayDay && holidayInfo) {
                html += '<div class="holiday-label">' + holidayInfo.name + '</div>';
            }
            if (hasEvent && isCurrentMonth) {
                var dots = '';
                var shown = 0;
                for (var e = 0; e < dayEvents.length && shown < 3; e++) {
                    var ev = dayEvents[e].event;
                    if (shouldShowEvent(ev, d)) {
                        dots += '<div class="event-dot" style="background:' + ev.color + ';"></div>';
                        shown++;
                    }
                }
                if (dots) html += dots;
                if (dayEvents.length > 3) {
                    html += '<span class="event-count">+' + (dayEvents.length - 3) + '</span>';
                }
            }
            html += '</div>';
        }

        grid.innerHTML = html;

        var cells = grid.querySelectorAll('.day-cell:not(.empty)');
        for (var c = 0; c < cells.length; c++) {
            cells[c].addEventListener('click', function() {
                var year = parseInt(this.dataset.year);
                var month = parseInt(this.dataset.month);
                var day = parseInt(this.dataset.day);
                var d = new Date(year, month, day);
                // Show tooltip on month view
                if (currentView === 'month') {
                    showTooltip(d);
                } else {
                    currentDate = d;
                    currentYear = year;
                    currentMonth = month;
                    currentDay = day;
                    switchView('day');
                }
            });
        }

        // Update week number
        var weekNum = getWeekNumber(new Date(year, month, 1));
        document.getElementById('weekNumberDisplay').textContent = 'Week ' + weekNum;
    }

    function renderWeekView(startDate) {
        var grid = document.getElementById('weekGrid');
        var html = '';
        var weekStart = new Date(startDate);

        for (var i = 0; i < 7; i++) {
            var d = new Date(weekStart);
            d.setDate(weekStart.getDate() + i);
            var isToday = isSameDay(d, today);
            var dayEvents = getAllEventsForDate(d);
            var isHolidayDay = isHoliday(d);
            var holidayInfo = getHolidaysForDate(d);

            html += '<div class="week-day" data-year="' + d.getFullYear() + '" data-month="' + d.getMonth() + '" data-day="' + d.getDate() + '">' +
                '<div class="week-day-label">' + shortDayNames[i] + (isHolidayDay ? ' 🎉' : '') + '</div>' +
                '<div class="week-day-number' + (isToday ? ' today' : '') + '">' + d.getDate() + '</div>';

            if (isHolidayDay && holidayInfo) {
                html += '<div style="font-size:0.5rem;color:#a53a3a;text-align:center;">' + holidayInfo.name + '</div>';
            }

            var filteredEvents = dayEvents.filter(function(item) {
                return shouldShowEvent(item.event, d);
            });

            var maxDisplay = 3;
            var displayEvents = filteredEvents.slice(0, maxDisplay);
            for (var e = 0; e < displayEvents.length; e++) {
                var ev = displayEvents[e].event;
                html += '<div class="week-event" style="border-left:3px solid ' + ev.color + ';">' +
                    '<span class="event-color-dot" style="background:' + ev.color + ';"></span>' +
                    sanitizeText(ev.text) +
                    (ev.time ? ' (' + formatTime(ev.time) + ')' : '') +
                    '</div>';
            }
            if (filteredEvents.length > maxDisplay) {
                html += '<div class="week-event more">+' + (filteredEvents.length - maxDisplay) + ' more</div>';
            }

            html += '</div>';
        }

        grid.innerHTML = html;

        var days = grid.querySelectorAll('.week-day');
        for (var d2 = 0; d2 < days.length; d2++) {
            days[d2].addEventListener('click', function() {
                var year = parseInt(this.dataset.year);
                var month = parseInt(this.dataset.month);
                var day = parseInt(this.dataset.day);
                currentDate = new Date(year, month, day);
                currentYear = year;
                currentMonth = month;
                currentDay = day;
                switchView('day');
            });
        }
    }

    function renderDayView(date) {
        if (!validateDate(date)) return;
        
        document.getElementById('dayViewDayName').textContent = dayNames[date.getDay()];
        document.getElementById('dayViewDate').textContent = formatDate(date);

        var dayEvents = getAllEventsForDate(date);
        document.getElementById('dayViewEventCount').textContent = dayEvents.length + ' events';

        var list = document.getElementById('dayEventsList');
        if (dayEvents.length === 0) {
            list.innerHTML = '<div class="no-events"><i class="ti ti-calendar-off"></i> No events on this day</div>';
        } else {
            var html = '';
            for (var i = 0; i < dayEvents.length; i++) {
                var item = dayEvents[i];
                var ev = item.event;
                if (!shouldShowEvent(ev, date)) continue;
                var isRepeated = item.isRepeated;
                html += '<div class="event-item" data-key="' + getDateKey(date) + '" data-index="' + i + '" style="border-left:4px solid ' + ev.color + ';">' +
                    '<span class="event-text">' +
                    '<span class="event-color-dot" style="background:' + ev.color + ';"></span>' +
                    sanitizeText(ev.text) +
                    (ev.time ? ' <span style="font-size:0.7rem;color:#aaa;">' + formatTime(ev.time) + (ev.endTime ? ' - ' + formatTime(ev.endTime) : '') + '</span>' : '') +
                    (isRepeated ? ' <span style="font-size:0.6rem;color:#888;">(repeating)</span>' : '') +
                    '</span>' +
                    '<div class="event-actions">' +
                    '<button class="edit-btn" onclick="editEvent(\'' + getDateKey(date) + '\', ' + i + ')"><i class="ti ti-edit"></i></button>' +
                    '<button class="delete-btn" onclick="deleteEventFromView(\'' + getDateKey(date) + '\', ' + i + ')"><i class="ti ti-x"></i></button>' +
                    '</div>' +
                    '</div>';
            }
            list.innerHTML = html || '<div class="no-events"><i class="ti ti-calendar-off"></i> No matching events</div>';
        }

        renderEventList(date);
    }

    function renderYearView(year) {
        var grid = document.getElementById('yearGrid');
        var html = '';

        for (var m = 0; m < 12; m++) {
            var daysInMonth = new Date(year, m + 1, 0).getDate();
            var firstDay = new Date(year, m, 1).getDay();

            html += '<div class="year-month">' +
                '<div class="year-month-label">' + monthNames[m] + '</div>' +
                '<div class="year-month-grid">';

            for (var i = 0; i < firstDay; i++) {
                html += '<div class="year-day empty"></div>';
            }

            for (var d = 1; d <= daysInMonth; d++) {
                var dateObj = new Date(year, m, d);
                var isToday = isSameDay(dateObj, today);
                var dayEvents = getAllEventsForDate(dateObj);
                var hasEvent = dayEvents.length > 0;
                var isWeekend = dateObj.getDay() === 0 || dateObj.getDay() === 6;
                var isHolidayDay = isHoliday(dateObj);

                var classes = 'year-day';
                if (isToday) classes += ' today';
                if (hasEvent) classes += ' has-event';
                if (isWeekend && !hasEvent && !isToday) classes += ' weekend';
                if (isHolidayDay) classes += ' holiday';

                html += '<div class="' + classes + '">' + d + '</div>';
            }

            html += '</div></div>';
        }

        grid.innerHTML = html;
    }

    function renderEventList(date) {
        var eventList = document.getElementById('eventList');

        if (date && validateDate(date)) {
            var dayEvents = getAllEventsForDate(date);
            var filtered = dayEvents.filter(function(item) {
                return shouldShowEvent(item.event, date);
            });
            
            if (filtered.length === 0) {
                eventList.innerHTML = '<div class="no-events-msg"><i class="ti ti-calendar-off"></i> No events on ' + formatDate(date) + '</div>';
                return;
            }

            var html = '<div class="selected-date-label"><i class="ti ti-calendar-event"></i> ' + formatDate(date) + '</div>';
            for (var i = 0; i < filtered.length; i++) {
                var item = filtered[i];
                var ev = item.event;
                var key = item.sourceKey || getDateKey(date);
                var idx = item.index;
                html += '<div class="event-item" data-key="' + key + '" data-index="' + idx + '" style="border-left:4px solid ' + ev.color + ';">' +
                    '<span class="event-text"><span class="event-color-dot" style="background:' + ev.color + ';"></span> ' +
                    sanitizeText(ev.text) +
                    (ev.time ? ' <span style="font-size:0.7rem;color:#aaa;">' + formatTime(ev.time) + (ev.endTime ? ' - ' + formatTime(ev.endTime) : '') + '</span>' : '') +
                    (item.isRepeated ? ' <span style="font-size:0.6rem;color:#888;">(repeating)</span>' : '') +
                    '</span>' +
                    '<div class="event-actions">' +
                    '<button class="edit-btn" onclick="editEvent(\'' + key + '\', ' + idx + ')"><i class="ti ti-edit"></i></button>' +
                    '<button class="delete-btn" onclick="deleteEventFromView(\'' + key + '\', ' + idx + ')"><i class="ti ti-x"></i></button>' +
                    '</div>' +
                    '</div>';
            }
            eventList.innerHTML = html;
        } else {
            var allKeys = Object.keys(events);
            if (allKeys.length === 0) {
                eventList.innerHTML = '<div class="no-events-msg"><i class="ti ti-calendar-off"></i> No events yet</div>';
                return;
            }

            allKeys.sort();
            var html = '<div class="selected-date-label"><i class="ti ti-list"></i> All Events</div>';
            var hasEvents = false;
            
            for (var k = 0; k < allKeys.length; k++) {
                var key = allKeys[k];
                var parts = key.split('-').map(Number);
                var d = new Date(parts[0], parts[1] - 1, parts[2]);
                var dayEvents = events[key];
                if (dayEvents && dayEvents.length > 0) {
                    var filteredAll = dayEvents.filter(function(ev) {
                        if (typeof ev === 'string') return true;
                        return shouldShowEvent(ev, d);
                    });
                    if (filteredAll.length === 0) continue;
                    hasEvents = true;
                    html += '<div style="font-size:0.75rem;color:#aaa;margin-top:8px;margin-bottom:2px;">' +
                        '<i class="ti ti-calendar-dot"></i> ' + formatDate(d) +
                        '</div>';
                    for (var e = 0; e < filteredAll.length; e++) {
                        var ev2 = filteredAll[e];
                        if (typeof ev2 === 'string') {
                            html += '<div class="event-item"><span class="event-text">' + sanitizeText(ev2) + '</span></div>';
                            continue;
                        }
                        html += '<div class="event-item" style="border-left:4px solid ' + ev2.color + ';">' +
                            '<span class="event-text"><span class="event-color-dot" style="background:' + ev2.color + ';"></span> ' +
                            sanitizeText(ev2.text) +
                            (ev2.time ? ' <span style="font-size:0.7rem;color:#aaa;">' + formatTime(ev2.time) + '</span>' : '') +
                            '</span>' +
                            '</div>';
                    }
                }
            }

            if (!hasEvents) {
                html = '<div class="no-events-msg"><i class="ti ti-calendar-off"></i> No matching events</div>';
            }
            eventList.innerHTML = html;
        }
    }

    // ============ TOOLTIP ============
    var tooltipDate = null;

    function showTooltip(date) {
        tooltipDate = new Date(date);
        document.getElementById('tooltipDate').textContent = formatDate(date);
        var container = document.getElementById('tooltipEvents');
        var dayEvents = getAllEventsForDate(date);
        var filtered = dayEvents.filter(function(item) {
            return shouldShowEvent(item.event, date);
        });
        
        if (filtered.length === 0) {
            container.innerHTML = '<div style="color:#555;padding:12px 0;">No events on this day</div>';
        } else {
            var html = '';
            for (var i = 0; i < filtered.length; i++) {
                var ev = filtered[i].event;
                html += '<div class="tooltip-event-item" style="border-left-color:' + ev.color + ';">' +
                    '<span class="event-color-dot" style="background:' + ev.color + ';"></span>' +
                    '<span class="event-text">' + sanitizeText(ev.text) + '</span>' +
                    '<span class="event-time">' + (ev.time ? formatTime(ev.time) : '') + '</span>' +
                    '</div>';
            }
            container.innerHTML = html;
        }
        
        document.getElementById('tooltipModal').classList.add('active');
    }

    document.getElementById('tooltipClose').addEventListener('click', function() {
        document.getElementById('tooltipModal').classList.remove('active');
    });

    document.getElementById('tooltipViewDay').addEventListener('click', function() {
        if (tooltipDate) {
            currentDate = new Date(tooltipDate);
            currentYear = currentDate.getFullYear();
            currentMonth = currentDate.getMonth();
            currentDay = currentDate.getDate();
            document.getElementById('tooltipModal').classList.remove('active');
            switchView('day');
        }
    });

    document.getElementById('tooltipModal').addEventListener('click', function(e) {
        if (e.target === this) {
            this.classList.remove('active');
        }
    });

    // ============ EDIT EVENT ============
    window.editEvent = function(key, index) {
        var parts = key.split('-').map(Number);
        var date = new Date(parts[0], parts[1] - 1, parts[2]);
        var ev = getEventObject(date, index);
        if (!ev) return;

        var newText = prompt('Edit event name:', ev.text);
        if (newText !== null && newText.trim() !== '') {
            var newColor = prompt('Enter color (hex, e.g. #4c9aff):', ev.color);
            if (newColor && /^#[0-9a-fA-F]{6}$/.test(newColor)) {
                updateEvent(date, index, newText, newColor, ev.time, ev.endTime);
            } else if (newColor === null) {
                updateEvent(date, index, newText, ev.color, ev.time, ev.endTime);
            } else {
                alert('Invalid color format. Use hex like #4c9aff');
            }
        }
    };

    window.deleteEventFromView = function(key, index) {
        if (confirm('Delete this event?')) {
            var parts = key.split('-').map(Number);
            var date = new Date(parts[0], parts[1] - 1, parts[2]);
            deleteEvent(date, index);
        }
    };

    // ============ VIEW MANAGEMENT ============
    function switchView(view) {
        currentView = view;

        var btns = document.querySelectorAll('.view-toggle button');
        for (var i = 0; i < btns.length; i++) {
            btns[i].classList.toggle('active', btns[i].dataset.view === view);
        }

        document.getElementById('monthView').classList.add('view-hidden');
        document.getElementById('weekView').classList.add('view-hidden');
        document.getElementById('dayView').classList.add('view-hidden');
        document.getElementById('yearView').classList.add('view-hidden');

        var viewMap = {
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
            var weekEnd = new Date(weekStartDate);
            weekEnd.setDate(weekStartDate.getDate() + 6);
            document.getElementById('monthYearDisplay').textContent =
                formatDateShort(weekStartDate) + ' - ' + formatDate(weekEnd);
            document.getElementById('weekNumberDisplay').textContent = 'Week ' + getWeekNumber(weekStartDate);
        } else if (currentView === 'year') {
            document.getElementById('monthYearDisplay').textContent = '' + currentYear;
        } else {
            document.getElementById('monthYearDisplay').textContent =
                monthNames[currentMonth] + ' ' + currentYear;
            document.getElementById('weekNumberDisplay').textContent = 'Week ' + getWeekNumber(new Date(currentYear, currentMonth, 1));
        }
    }

    function navigate(delta) {
        if (currentView === 'month') {
            var newDate = new Date(currentYear, currentMonth + delta, 1);
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
            currentYear += delta;
        }
        updateHeader();
        renderView();
    }

    function goToToday() {
        var now = new Date();
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

    // ============ EXPORT / IMPORT ============
    function exportCalendar() {
        var data = {
            version: '2.0',
            exportedAt: new Date().toISOString(),
            events: events,
            holidays: holidays
        };
        var blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        var url = URL.createObjectURL(blob);
        var a = document.createElement('a');
        a.href = url;
        a.download = 'calendar-' + new Date().toISOString().slice(0, 10) + '.recl';
        a.click();
        URL.revokeObjectURL(url);
        showToast('Calendar exported successfully!');
    }

    function importCalendar(file) {
        var reader = new FileReader();
        reader.onload = function(e) {
            try {
                var data = JSON.parse(e.target.result);
                if (!data.events || typeof data.events !== 'object') {
                    alert('Invalid .RECL file format');
                    return;
                }
                if (!confirm('Import will replace all current events. Continue?')) return;
                events = data.events;
                if (data.holidays) {
                    for (var key in data.holidays) {
                        if (data.holidays.hasOwnProperty(key)) {
                            holidays[key] = data.holidays[key];
                        }
                    }
                }
                saveEvents();
                renderView();
                if (datepicker) datepicker.update();
                showToast('Calendar imported successfully!');
            } catch (err) {
                alert('Error importing file: ' + err.message);
            }
        };
        reader.readAsText(file);
    }

    // ============ KEYBOARD SHORTCUTS ============
    function setupKeyboardShortcuts() {
        document.addEventListener('keydown', function(e) {
            if (e.key === 'Escape') {
                document.activeElement && document.activeElement.blur();
                document.getElementById('tooltipModal').classList.remove('active');
                return;
            }
            if (e.ctrlKey && e.key === 't') {
                e.preventDefault();
                goToToday();
                return;
            }
            if (e.key === 'ArrowLeft') { e.preventDefault(); navigate(-1); return; }
            if (e.key === 'ArrowRight') { e.preventDefault(); navigate(1); return; }
            
            // Ctrl+F - Focus search
            if (e.ctrlKey && e.key === 'f') {
                e.preventDefault();
                document.getElementById('searchInput').focus();
                return;
            }
            
            // Ctrl+E - Export
            if (e.ctrlKey && e.key === 'e') {
                e.preventDefault();
                exportCalendar();
                return;
            }
        });
    }

    // ============ NOTIFICATION CHECK ============
    function setupNotifications() {
        document.getElementById('notifBtn').addEventListener('click', function() {
            if ('Notification' in window) {
                if (Notification.permission === 'granted') {
                    showToast('Notifications are enabled!');
                    sendNotification('Restudio Calendar', 'Notifications are working!', 0);
                } else if (Notification.permission === 'denied') {
                    alert('Notifications are blocked. Please enable them in your browser settings.');
                } else {
                    Notification.requestPermission().then(function(perm) {
                        if (perm === 'granted') {
                            showToast('Notifications enabled!');
                            sendNotification('Restudio Calendar', 'Notifications are working!', 0);
                        } else {
                            alert('Notifications permission denied.');
                        }
                    });
                }
            } else {
                alert('Notifications are not supported in this browser.');
            }
        });

        // Check for upcoming notifications every minute
        setInterval(scheduleNotifications, 60000);
    }

    // ============ SYNC (Firebase Ready) ============
    function setupSync() {
        document.getElementById('syncBtn').addEventListener('click', function() {
            showToast('Cloud sync: Please configure Firebase credentials in script.js');
            // Firebase integration placeholder
            // To enable: Add Firebase config and uncomment sync code
            /*
            if (typeof firebase !== 'undefined') {
                // Sync logic here
            }
            */
        });
    }

    // ============ DRAG & DROP (Week View) ============
    function setupDragDrop() {
        var weekGrid = document.getElementById('weekGrid');
        if (!weekGrid) return;

        if (typeof Sortable !== 'undefined') {
            new Sortable(weekGrid, {
                animation: 150,
                handle: '.week-day',
                onEnd: function(evt) {
                    var items = Array.from(weekGrid.children);
                    var newOrder = items.map(function(el) {
                        return {
                            year: parseInt(el.dataset.year),
                            month: parseInt(el.dataset.month),
                            day: parseInt(el.dataset.day)
                        };
                    });
                    // Reorder events based on drag
                    // This is a placeholder - full implementation would require event reassignment
                    showToast('Drag & Drop: Events can be reorganized');
                }
            });
        }
    }

    // ============ INIT DATEPICKER ============
    function initDatepicker() {
        var input = document.getElementById('eventDateInput');

        datepicker = new AirDatepicker(input, {
            locale: {
                days: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
                daysShort: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
                daysMin: ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'],
                months: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September',
                    'October', 'November', 'December'
                ],
                monthsShort: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
                today: 'Today',
                clear: 'Clear',
                dateFormat: 'MM dd, yyyy',
                timeFormat: 'hh:mm aa',
                firstDay: 0
            },
            selectedDates: [currentDate],
            onSelect: function(_ref) {
                var date = _ref.date;
                if (date) {
                    var d = new Date(date);
                    currentDate = d;
                    currentYear = d.getFullYear();
                    currentMonth = d.getMonth();
                    currentDay = d.getDate();
                    renderView();
                    updateHeader();
                }
            },
            onRenderCell: function(_ref2) {
                var date = _ref2.date,
                    cellType = _ref2.cellType;
                if (cellType === 'day') {
                    var d = new Date(date);
                    var dayEvents = getAllEventsForDate(d);
                    if (dayEvents.length > 0) {
                        return {
                            html: '<span class="air-datepicker-event-dot"></span>'
                        };
                    }
                }
            }
        });

        setTimeout(function() {
            if (datepicker) {
                datepicker.selectDate(currentDate);
            }
        }, 100);
    }

    // ============ INIT TIME PICKERS ============
    function initTimePickers() {
        if (typeof flatpickr !== 'undefined') {
            timePickerStart = flatpickr('#eventStartTime', {
                enableTime: true,
                noCalendar: true,
                dateFormat: 'H:i',
                defaultDate: '09:00',
                time_24hr: true
            });
            
            timePickerEnd = flatpickr('#eventEndTime', {
                enableTime: true,
                noCalendar: true,
                dateFormat: 'H:i',
                defaultDate: '10:00',
                time_24hr: true
            });
        }
    }

    // ============ TOAST ============
    function showToast(message) {
        var toast = document.createElement('div');
        toast.className = 'toast-message';
        toast.textContent = message;
        toast.style.cssText = 'position:fixed;bottom:30px;left:50%;transform:translateX(-50%);background:#252526;color:#e0e0e0;padding:12px 24px;border-radius:12px;z-index:9999;border:1px solid #3a3a3a;box-shadow:0 4px 16px rgba(0,0,0,0.4);font-family:Roboto,sans-serif;animation:slideUpToast 0.3s ease-out;';
        document.body.appendChild(toast);
        setTimeout(function() { toast.style.opacity = '0'; setTimeout(function() { toast.remove(); }, 300); }, 2500);
    }

    // ============ EVENT LISTENERS ============
    function setupEventListeners() {
        var viewBtns = document.querySelectorAll('.view-toggle button');
        for (var i = 0; i < viewBtns.length; i++) {
            viewBtns[i].addEventListener('click', function() {
                switchView(this.dataset.view);
            });
        }

        document.getElementById('prevBtn').addEventListener('click', function() { navigate(-1); });
        document.getElementById('nextBtn').addEventListener('click', function() { navigate(1); });
        document.getElementById('todayBtn').addEventListener('click', goToToday);

        document.getElementById('addEventBtn').addEventListener('click', function() {
            var dateInput = document.getElementById('eventDateInput');
            var textInput = document.getElementById('eventTextInput');
            var colorInput = document.getElementById('eventColor');
            var startTimeInput = document.getElementById('eventStartTime');
            var endTimeInput = document.getElementById('eventEndTime');
            var repeatInput = document.getElementById('eventRepeat');
            var repeatEndInput = document.getElementById('eventRepeatEnd');
            var notifyInput = document.getElementById('eventNotify');

            if (!dateInput.value) { alert('Please select a date'); return; }
            if (!textInput.value.trim()) { alert('Please enter an event name'); return; }

            var selectedDate = datepicker ? datepicker.selectedDates[0] : currentDate;
            var d = new Date(selectedDate);

            if (addEvent(d, textInput.value, colorInput.value, startTimeInput.value, endTimeInput.value, repeatInput.value, repeatEndInput.value || null, parseInt(notifyInput.value))) {
                textInput.value = '';
                if (datepicker) datepicker.update();
                showToast('Event added!');
            }
        });

        document.getElementById('eventTextInput').addEventListener('keypress', function(e) {
            if (e.key === 'Enter') {
                document.getElementById('addEventBtn').click();
            }
        });

        // Export
        document.getElementById('exportBtn').addEventListener('click', exportCalendar);

        // Import
        document.getElementById('importBtn').addEventListener('click', function() {
            document.getElementById('importFileInput').click();
        });
        document.getElementById('importFileInput').addEventListener('change', function(e) {
            if (e.target.files[0]) {
                importCalendar(e.target.files[0]);
                e.target.value = '';
            }
        });
    }

    // ============ INIT ============
    loadEvents();
    initDatepicker();
    initTimePickers();
    setupEventListeners();
    setupKeyboardShortcuts();
    setupNotifications();
    setupSync();
    setupDragDrop();
    requestNotificationPermission();
    switchView('day');
    console.log('Restudio Calendar initialized successfully');

})();
