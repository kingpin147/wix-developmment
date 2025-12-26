import { listUpcomingEvents, getEventDetails, createEventRSVP } from 'backend/eventsService.web';
import { groupEventsByDate, getCalendarDays, formatEventForDisplay } from 'public/bookingCalendar';
import wixLocation from 'wix-location';

let allEvents = [];
let eventsByDate = {};
let currentMonth = new Date().getMonth();
let currentYear = new Date().getFullYear();

$w.onReady(async function () {
    await loadEvents();
    renderCalendar(currentMonth, currentYear);
    setupEventListeners();
});

async function loadEvents() {
    $w("#loadingState").show(); // Optional: A loader element
    try {
        allEvents = await listUpcomingEvents();
        eventsByDate = groupEventsByDate(allEvents);
    } catch (err) {
        $w("#errorText").text = "Failed to load events.";
        $w("#errorText").show();
    } finally {
        $w("#loadingState").hide();
    }
}

function renderCalendar(month, year) {
    const days = getCalendarDays(month, year);
    $w("#calendarRepeater").data = days.map((day, index) => ({
        _id: index.toString(),
        ...day
    }));

    $w("#monthLabel").text = new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric' }).format(new Date(year, month));
}

$w("#calendarRepeater").onItemReady(($item, itemData, index) => {
    const dateStr = itemData.date.toDateString();
    const eventsForDay = eventsByDate[dateStr] || [];

    $item("#dateNumber").text = itemData.date.getDate().toString();

    // Dim out days not in current month
    if (!itemData.isCurrentMonth) {
        $item("#dateCell").style.backgroundColor = "#F0F0F0";
        $item("#dateNumber").style.color = "#AAAAAA";
    }

    // Show indicator if events exist
    if (eventsForDay.length > 0) {
        $item("#eventIndicator").show();
        $item("#eventCount").text = `${eventsForDay.length} Events`;
    } else {
        $item("#eventIndicator").hide();
    }

    $item("#dateCell").onClick(() => {
        showEventsForDate(eventsForDay, itemData.date);
    });
});

function showEventsForDate(events, date) {
    $w("#selectedDateLabel").text = date.toLocaleDateString();
    if (events.length === 0) {
        $w("#eventListRepeater").data = [];
        $w("#noEventsMessage").show();
    } else {
        $w("#noEventsMessage").hide();
        $w("#eventListRepeater").data = events.map(e => formatEventForDisplay(e));
    }
    $w("#eventSidebar").expand(); // Show the sidebar with event details
}

$w("#eventListRepeater").onItemReady(($item, itemData) => {
    $item("#eventTitle").text = itemData.title;
    $item("#eventTime").text = itemData.formattedTime;
    $item("#eventType").text = itemData.typeLabel;

    $item("#bookButton").onClick(() => {
        handleBookingFlow(itemData);
    });
});

function handleBookingFlow(event) {
    if (event.registrationType === "TICKETS") {
        // Redirect to Wix's native event page for checkout integration
        wixLocation.to(`/event-details/${event.slug}`);
    } else {
        // Handle RSVP in a custom lightbox or form
        $w("#rsvpLightbox").show({ eventId: event.id });
    }
}

function setupEventListeners() {
    $w("#prevMonth").onClick(() => {
        currentMonth--;
        if (currentMonth < 0) {
            currentMonth = 11;
            currentYear--;
        }
        renderCalendar(currentMonth, currentYear);
    });

    $w("#nextMonth").onClick(() => {
        currentMonth++;
        if (currentMonth > 11) {
            currentMonth = 0;
            currentYear++;
        }
        renderCalendar(currentMonth, currentYear);
    });
}
