import { permissions, webMethod } from 'wix-web-module';
import { queryEvents } from 'wix-events-backend';
import { orders, rsvp } from 'wix-events.v2';

/**
 * Fetches upcoming events for the calendar.
 * @returns {Promise<Array>} List of events.
 */
export const listUpcomingEvents = webMethod(permissions.Anyone, async () => {
    try {
        const results = await queryEvents()
            .eq("status", "SCHEDULED") // Only show upcoming events
            .find();
        
        return results.items.map(event => ({
            id: event._id,
            title: event.title,
            start: event.scheduling.startDate,
            end: event.scheduling.endDate,
            location: event.location.name,
            slug: event.slug,
            registrationType: event.registration.type, // RSVP or TICKETS
            mainImage: event.mainImage
        }));
    } catch (error) {
        console.error("Failed to fetch events:", error);
        throw new Error("Unable to load events.");
    }
});

/**
 * Creates a reservation for a ticketed event.
 * @param {string} eventId 
 * @param {Array} ticketSelection [{ticketId, quantity}]
 * @returns {Promise<Object>} Reservation details.
 */
export const createEventReservation = webMethod(permissions.Anyone, async (eventId, ticketSelection) => {
    try {
        const options = {
            lineItems: ticketSelection.map(item => ({
                catalogReference: {
                    catalogItemId: item.ticketId,
                    appId: "14563d33-9122-4a0b-9df2-9b2f34963503" // Wix Events App ID
                },
                quantity: item.quantity
            }))
        };

        const reservation = await orders.createReservation(eventId, options);
        return reservation;
    } catch (error) {
        console.error("Failed to create reservation:", error);
        throw new Error("Unable to reserve tickets.");
    }
});

/**
 * Creates an RSVP for a ticketless event.
 * @param {string} eventId 
 * @param {Object} guestDetails {firstName, lastName, email}
 * @returns {Promise<Object>} RSVP details.
 */
export const createEventRSVP = webMethod(permissions.Anyone, async (eventId, guestDetails) => {
    try {
        const response = await rsvp.createRsvp(eventId, {
            guest: {
                firstName: guestDetails.firstName,
                lastName: guestDetails.lastName,
                email: guestDetails.email
            },
            status: "YES"
        });
        return response;
    } catch (error) {
        console.error("Failed to create RSVP:", error);
        throw new Error("Unable to confirm RSVP.");
    }
});

/**
 * Gets details for a specific event, including tickets if applicable.
 * @param {string} eventId 
 */
export const getEventDetails = webMethod(permissions.Anyone, async (eventId) => {
    try {
        const results = await queryEvents()
            .eq("_id", eventId)
            .find();
        
        if (results.items.length === 0) throw new Error("Event not found");
        
        const event = results.items[0];
        // Note: Tickets are usually queried separately or included in some API versions.
        // For custom picker, we might need another call to wix-events.v2/tickets if needed.
        return event;
    } catch (error) {
        console.error("Failed to get event details:", error);
        throw new Error("Unable to load event details.");
    }
});
