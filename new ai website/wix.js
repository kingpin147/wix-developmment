import wixData from 'wix-data';
import wixWindow from 'wix-window';
import { createMyPayment } from 'backend/pay';
import wixPay from 'wix-pay';
import wixMembers from 'wix-members';
import { getTimeslots, getPrice } from 'backend/data';
import { submitBooking } from 'backend/submit';
import { createSessionIds } from 'public/session.js'
import { getAffiliateId } from 'public/affiliate.js';
import { logger } from 'public/log.js';

import { createTaskPickupandDelivery } from 'backend/tookan'
import wixLocation from 'wix-location';
import wixStorage from 'wix-storage';
// Min hours difference between collection and delivery
const MinHoursDiff = 4;
let description;
let member;
let boxData = {};
let tempData = {};
// global variable to hold price
var orderPrice = 99;

// global variable to hold current user's contactId
let contactId = '';

// global session id for this interaction
let sessionId = 'n/a';
// global bookingId for this interaction, will be overriden on page load
let bookingId = Math.floor(Math.random() * 1234567894723);
import { createPaymentIntent } from 'backend/stripePayment'
const errFunc = (err) => {
    console.log('Error: ', err)
    let data = {};
    logger.log(sessionId, "payment Cancelled");
    data.title = 'Payment cancelled';
    data.subtitle = 'We could not complete the payment';
    data.explanation = err.message;
    data.callToAction = 'Please try again. Your booking will be finalised once the payment completes';
    wixWindow.openLightbox("paymentfailed", data);
}
export async function payNow() {
    member = await wixMembers.currentMember.getMember()
    const string = $w('#summaryTotalPrice').text
    const number = parseInt(string.match(/\d+/)[0]);
    let payment = {
        "amount": (number * 100),
        "currency": "AED",
        "description": description,
        email: member.loginEmail
    }
    wixStorage.session.setItem('boxData', JSON.stringify(boxData))
    createPaymentIntent(payment, tempData).then((data) => {
        console.log(data);
        wixLocation.to(data.url)
    }).catch((err) => {
        errFunc(err)
    })
    // createToken(encodeCard(createCard()))
    //     .then((token) => {
    //         const cardDetails = {
    //             name: $w("#cardholder").value,
    //             number: $w("#cardnum").value,
    //             cvc: $w("#cvc").value,
    //             exp_year: $w("#year").value,
    //             exp_month: $w("#month").value,
    //             zipCode: $w("#zipcode").value,
    //             state: $w("#state").value
    //         }
    //         console.log('token: ', token)
    //         if (token.id) {
    //             console.log(number)
    //         } else {
    //             throw new Error(`Wrong Card Number!`)
    //             // errFunc()
    //         }

    //     }).catch((err) => {
    //         errFunc(err)
    //     })

    // .then((result) => {
    //                 logger.log(sessionId, `Start payment. Payment id: ${result.payment.id}. Trx Id: ${result.transactionId}`);

    //                 if (result.status === "Successful") {
    //                     logger.log(sessionId, "scrTransition", "finish");
    //                     logger.log(sessionId, "payment successful");
    //                     wixWindow.openLightbox("thankyou", data);
    //                 } else {
    //                     let data = {};
    //                     if (result.status === "Pending") {
    //                         logger.log(sessionId, "payment Pending");
    //                         data.title = 'Payment pending';
    //                         data.subtitle = 'The funds have not left your account yet';
    //                         data.explanation = 'This is taking more than usual. Check with your bank to make sure the payment is not withheld';
    //                         data.callToAction = 'Once the payment is cleared, you will receive a confirmation e-mail';
    //                     } else if (result.status === "Failed") {
    //                         logger.log(sessionId, "payment Failed");
    //                         data.title = 'Payment failed';
    //                         data.subtitle = 'We could not complete the payment';
    //                         data.explanation = 'Were the card details correct? Was the payment declined by the bank?';
    //                         data.callToAction = 'Please try again. Maybe use a different card this time?';
    //                     } else if (result.status === "Cancelled") {
    //                         logger.log(sessionId, "payment Cancelled");
    //                         data.title = 'Payment cancelled';
    //                         data.subtitle = 'We could not complete the payment';
    //                         data.explanation = 'Did you accidentally cancel the payment?';
    //                         data.callToAction = 'Please try again. Your booking will be finalised once the payment completes';
    //                     }
    //                     wixWindow.openLightbox("paymentfailed", data);
    //                 }
    //             });
    //     })
    // .then((res) => {
    //     card.handleCardPayment(res.client_secret)
    //         .then(function (result) {
    //             if (result.error) {
    //                 // Display error.message in your UI
    //                 console.log('error')
    //             } else {
    //                 console.log('success')
    //                 // The payment succeeded!
    //             }
    //         });
    // });
    //         charge(token, payment, wixUsers.currentUser.id)
    //             .then((response) => {
    //                 if (response.chargeId) {
    //                     wixWindow.openLightbox('thankyou')
    //                 } else {
    //                     wixWindow.openLightbox('paymentfailed')
    //                 }
    //                 $w('#response').show();
    //             });
    // });
}

function getAddressValueTookan(service) {
    let terminal, address = undefined;
    if (service == 'collection') {
        terminal = $w('#collectionTerminal')
        address = $w('#collectionAddress')
    } else {
        terminal = $w('#deliveryTerminal')
        address = $w('#deliveryAddress')
    }
    if (!terminal.collapsed) {
        return (terminal.value) ? terminals[terminal.value].address.location : undefined;
    } else {
        // needs to be a valid Google address, not a forced manual string 
        const v = address.value
        if (!address.valid ||
            !v ||
            !v.formatted ||
            !v.location ||
            !v.location.latitude ||
            !v.location.longitude ||
            !v.streetAddress ||
            !v.streetAddress.formattedAddressLine) {
            return undefined;
        } else {
            return address.value.location;
        }
    }
}

function createTaskforPickup() {
    const inputCollectionDateStr = $w('#summaryCollectionDateTime').text;
    const inputCollectionDate = new Date(inputCollectionDateStr);
    const formattedCollectionDate = inputCollectionDate.toISOString();
    const inputDeliveryDateStr = $w('#summaryDeliveryDateTime').text;
    const inputDeliveryDate = new Date(inputDeliveryDateStr);
    const formattedDeliveryDate = inputDeliveryDate.toISOString();
    let collectionLocation = getAddressValueTookan('collection')
    let deliveryLocation = getAddressValueTookan('delivery')
    let price = String($w('#summaryTotalPrice').text); // String
    let bags = String($w('#summaryItems').text) // String
    let order_id = bookingId;
    let team_id = "";
    let auto_assignment = "0";
    let job_description = $w("#service").label;
    let job_pickup_phone = String($w('#phone').value);
    let job_pickup_name = String($w('#firstName').value) + " " + String($w('#lastName').value);
    let job_pickup_email = String($w('#email').value)
    let job_pickup_address = String($w('#summaryCollectionAddress').text);
    let job_pickup_latitude = collectionLocation.latitude;
    let job_pickup_longitude = collectionLocation.longitude;
    let job_pickup_datetime = formattedCollectionDate; /////////////////////////////////////////////////////////////
    let customer_email = job_pickup_email;
    let customer_username = job_pickup_name;
    let customer_phone = job_pickup_phone;
    let customer_address = $w('#summaryDeliveryAddress').text;
    let latitude = deliveryLocation.latitude;
    let longitude = deliveryLocation.longitude;
    let job_delivery_datetime = formattedDeliveryDate; ////////////////////////////////////////////////////////
    let has_pickup = "1";
    let has_delivery = "1";
    let layout_type = "0";
    let tracking_link = 1;
    let timezone = "0";
    let custom_field_template = "Template_1";
    let meta_data = [{
            label: "Price",
            data: price,
        },
        {
            label: "Bags",
            data: bags,
        },
    ]
    let pickup_custom_field_template = "Template_2";
    let pickup_meta_data = [{
            label: "Price",
            data: price,
        },
        {
            label: "Bags",
            data: bags,
        },
    ]

    let fleet_id = "";
    let p_ref_images = [
        "http://tookanapp.com/wp-content/uploads/2015/11/logo_dark.png",
        "http://tookanapp.com/wp-content/uploads/2015/11/logo_dark.png",
    ]
    let ref_images = [
        "http://tookanapp.com/wp-content/uploads/2015/11/logo_dark.png",
        "http://tookanapp.com/wp-content/uploads/2015/11/logo_dark.png",
    ]
    let notify = 1;
    let tags = "";
    let geofence = 0;
    let ride_type = 0;
    let requestBody = {
        order_id: order_id,
        team_id: "",
        auto_assignment: "0",
        job_description: job_description,
        job_pickup_phone: job_pickup_phone,
        job_pickup_name: job_pickup_name,
        job_pickup_email: job_pickup_email,
        job_pickup_address: job_pickup_address,
        job_pickup_latitude: job_pickup_latitude,
        job_pickup_longitude: job_pickup_longitude,
        job_pickup_datetime: job_pickup_datetime,
        customer_email: customer_email,
        customer_username: customer_username,
        customer_phone: customer_phone,
        customer_address: customer_address,
        latitude: latitude,
        longitude: longitude,
        job_delivery_datetime: job_delivery_datetime,
        has_pickup: "1",
        has_delivery: "1",
        layout_type: "0",
        tracking_link: 1,
        timezone: timezone,
        custom_field_template: "Template_1",
        meta_data: meta_data,
        pickup_custom_field_template: "Template_2",
        pickup_meta_data: pickup_meta_data,
        fleet_id: "",
        p_ref_images: p_ref_images,
        ref_images: ref_images,
        notify: 1,
        tags: "",
        geofence: 0,
        ride_type: 0,
    };
    createTaskPickupandDelivery(requestBody)

}

function filterDeliveryTimeslots(arrayOfTimeslots) {

    const collectionDateTime = $w('#collectionDate').value ? $w('#collectionDate').value : new Date();
    const [collectionHours, collectionMinutes] = ($w('#collectionTime').value ? $w('#collectionTime').value : '00:00').split(':');
    collectionDateTime.setHours(parseInt(collectionHours));
    collectionDateTime.setMinutes(parseInt(collectionMinutes));

    const minDeliveryDateTime = new Date(collectionDateTime.getTime() + MinHoursDiff * 60 * 60 * 1000);
    const deliveryDate = $w('#deliveryDate').value;

    const validTs = arrayOfTimeslots.filter(ts => {
        const [deliveryHours, deliveryMinutes] = ts.split(':');
        const deliveryDateTime = deliveryDate;
        deliveryDateTime.setHours(parseInt(deliveryHours));
        deliveryDateTime.setMinutes(parseInt(deliveryMinutes));

        return deliveryDateTime >= minDeliveryDateTime;
    });

    return validTs;
}

async function prepopulateTerminals(service) {
    const options = Object.keys(terminals).map(key => {
        return {
            value: key,
            label: terminals[key].label
        };
    });
    let dropdown = undefined;
    if (service == 'collection') {
        dropdown = $w('#collectionTerminal');
    } else {
        dropdown = $w('#deliveryTerminal');
    }
    if (dropdown.options.length == 0) {
        dropdown.options = options
        // force a re-render of the options list in edge cases
        dropdown.collapse();
        dropdown.expand();
    }
}

// Get the value of the address for the given service (collection or delivery)
// Depending on which element is enabled return its value or undefined
function getAddressValue(service) {
    let terminal, address = undefined;
    if (service == 'collection') {
        terminal = $w('#collectionTerminal')
        address = $w('#collectionAddress')
    } else {
        terminal = $w('#deliveryTerminal')
        address = $w('#deliveryAddress')
    }
    if (!terminal.collapsed) {
        return (terminal.value) ? terminals[terminal.value].address : undefined;
    } else {
        // needs to be a valid Google address, not a forced manual string 
        const v = address.value
        if (!address.valid ||
            !v ||
            !v.formatted ||
            !v.location ||
            !v.location.latitude ||
            !v.location.longitude ||
            !v.streetAddress ||
            !v.streetAddress.formattedAddressLine) {
            return undefined;
        } else {
            return address.value;
        }
    }
}

// Toggle visual validation on (true) or off (false) for scr1 components
function scr1Validate(val) {
    const addr = getAddressValue('collection');
    if (val) {
        $w('#service').updateValidityIndication();
        $w('#itemsDropdown').updateValidityIndication();
        $w('#collectionTerminal').updateValidityIndication();
        // specifically for address, remove invalid (hand-crafted) values
        if (!addr) {
            $w('#collectionAddress').value = undefined;
            $w('#collectionAddress').updateValidityIndication();
        }
        $w('#collectionDate').updateValidityIndication();
        $w('#collectionTime').updateValidityIndication();
    } else {
        $w('#service').resetValidityIndication();
        $w('#itemsDropdown').resetValidityIndication();
        $w('#collectionTerminal').resetValidityIndication();
        $w('#collectionAddress').resetValidityIndication();
        $w('#collectionDate').resetValidityIndication();
        $w('#collectionTime').resetValidityIndication();
    }
}

$w.onReady(async function () {

    [sessionId, bookingId] = await createSessionIds();

    // change date format and timezone for DatePickers
    // set current value 
    // then expand them to render properly
    // otherwise it causes problems around month-end dates early in the morning
    $w('#collectionDate').dateFormat = 'YYYY/MM/DD';
    $w("#collectionDate").timeZone = 'Asia/Dubai';
    $w('#deliveryDate').dateFormat = 'YYYY/MM/DD';
    $w("#deliveryDate").timeZone = 'Asia/Dubai';
    const currDate = new Date();
    $w('#collectionDate').value = currDate
    $w('#deliveryDate').value = currDate;
    $w('#collectionDate').expand();
    $w('#deliveryDate').expand();

    prepopulateTerminals('collection');
    prepopulateTerminals('delivery');

    toggleTerminalDropdown('collection', true);

    logger.log(sessionId, "scrTransition", "1");

    // seed the timeslots drop-down
    pleaseWait($w("#collectionTime"));
    getTimeslots(currDate, 'collection', getAddressValue('collection'), sessionId)
        .then(data => {
            // timeslots come pre-filtered with the booking cut-off window (6h)
            const times12Hour = convertTo12HourFormat(data);
            updateTimeDropdown($w("#collectionTime"), times12Hour, data, 'Collection time')
        })
        .catch(error => {
            logger.error(sessionId, "Collection timeslots error", error);
        });

    $w('#submitButton').onClick(() => {
        if ($w('#creditCard').checked && ($w('#acceptTandC').checked) && ($w('#acceptPolicy').checked)) {
            scr4Validate(false);
            const data = submitFormData(bookingId);
            if (data) {
                wixWindow.openLightbox("thankyou", data);
            }
        } else {
            scr4Validate(true);
        }
    })

    $w('#scr2GoBack').onClick(() => {
        $w('#mainStateBox').changeState("State1")
    })
    $w('#scr3GoBack').onClick(() => {
        $w('#mainStateBox').changeState("State2")
    })
    $w('#scr4GoBack').onClick(() => {
        $w('#mainStateBox').changeState("State3")
    })

    // address value validations
    $w('#collectionAddress').onCustomValidation(collDubaiAddressValidator);
    $w('#deliveryAddress').onCustomValidation(delDubaiAddressValidator);
});

function convertTo12HourFormat(times) {

    const formattedTimes = [];

    times.forEach(time => {
        const timePart = time.split(':');
        let hour = parseInt(timePart[0]);
        const minute = timePart[1];

        const amPm = hour >= 12 ? 'PM' : 'AM';
        hour = hour % 12 || 12;

        formattedTimes.push(`${hour}:${minute} ${amPm}`);
    });

    return formattedTimes;
}

// Only allow Dubai addresses for specific services
function collDubaiAddressValidator(address, rejectFunction) {
    const svc = $w('#service').value;
    const isAddressVisible = !$w('#collectionAddress').collapsed;
    const isDubaiSvc = (svc == 'dubai-departing' || svc == 'dubai-arriving');
    if (isDubaiSvc &&
        (!address ||
            !address.location ||
            !isPointInDubai(address.location.latitude, address.location.longitude))) {
        rejectFunction('Service available in Dubai only');
        if (isAddressVisible) {
            $w('#collectionAddressValidation').expand();
        }
        $w('#collectionAddress').value = undefined;
    } else {
        $w('#collectionAddressValidation').collapse();
    }
}

// Only allow Dubai addresses for specific services
function delDubaiAddressValidator(address, rejectFunction) {
    const svc = $w('#service').value;
    const isAddressVisible = !$w('#deliveryAddress').collapsed;
    const isDubaiSvc = (svc == 'dubai-departing' || svc == 'dubai-arriving');
    if (isDubaiSvc &&
        (!address ||
            !address.location ||
            !isPointInDubai(address.location.latitude, address.location.longitude))) {
        rejectFunction('Service available in Dubai only');
        if (isAddressVisible) {
            $w('#deliveryAddressValidation').expand();
        }
        $w('#deliveryAddress').value = undefined;
    } else {
        $w('#deliveryAddressValidation').collapse();
    }
}

// Toggle validation highlight on (true) or off (false) for scr3 components
function scr3Validate(val) {
    if (val) {
        $w('#firstName').updateValidityIndication();
        $w('#lastName').updateValidityIndication();
        $w('#email').updateValidityIndication();
        $w('#phone').updateValidityIndication();
    } else {
        $w('#firstName').resetValidityIndication();
        $w('#lastName').resetValidityIndication();
        $w('#email').resetValidityIndication();
        $w('#phone').resetValidityIndication();
    }
}

export function scr3Continue_click(event) {

    if ($w('#firstName').valid && $w('#lastName').valid && $w('#email').valid && $w('#phone').valid) {
        scr3Validate(false);
        let phone = $w('#phone').value;
        let email = $w('#email').value;
        $w('#summaryName').text = $w('#firstName').value + " " + $w('#lastName').value
        $w('#summaryEmail').text = $w('#email').value
        $w('#summaryPhone').text = $w('#phone').value
        $w('#mainStateBox').changeState("State4")
        $w('#mainStateBox').scrollTo();
        toggleAggreementGroups(contactId);
        logger.log(sessionId, "scrTransition", "4");
    } else {
        scr3Validate(true);
    }
    updatePrice();
}

// Show (contactId == guest) or hide the T&C and contact controls.
function toggleAggreementGroups(contactId) {
    if (contactId != 'guest') {
        $w('#policyGroup').collapse();
        $w('#acceptTandC').checked = true;
        $w('#acceptPolicy').checked = true;
        $w('#contactPermissionGroup').collapse();
        $w('#contactRadioGroup').value = 'mail-optout';
    } else {
        $w('#policyGroup').expand();
        $w('#acceptTandC').checked = false;
        $w('#acceptPolicy').checked = false;
        $w('#contactPermissionGroup').expand();
        $w('#contactRadioGroup').value = 'mail-optin';
    }
}

// Formats an ISO8601 string set at UAE timezone from the given date and time controls
// Time looks like this '11:00'
// If either argument is not valid, they default to today 00:01
// Attempting to set to 00:00, actually sets the hours to 24:00
function getDateinISOFormat(dateControl, timeControl) {

    const dateObj = (dateControl && dateControl.value && dateControl.value != '') ? dateControl.value : new Date();
    const timeArr = ((timeControl && timeControl.value && timeControl.value != '') ? timeControl.value : '00:00').split(':');
    dateObj.setHours(parseInt(timeArr[0]));
    dateObj.setMinutes(parseInt(timeArr[1]));
    // force the date in the correct timezone, we do not know where the user's browser is
    const timeZone = 'Asia/Dubai';
    const components = new Intl.DateTimeFormat('en-GB', {
        timeZone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
    }).formatToParts(dateObj);

    const parts = {};
    components.forEach(({ type, value }) => {
        parts[type] = value;
    });

    const iso8601String = `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}` + '+0400';
    return iso8601String;
}

/*
 * Moving to 2nd screen.
 * Validate, then 
 *  - update summary, and
 *  - delivery timeslots based on collection
 */
export async function scr1Continue_click(event) {

    let date = $w('#collectionDate').value;
    let time = $w('#collectionTime').value;
    let collAddress = getAddressValue('collection');
    let delAddress = getAddressValue('delivery');
    if ($w('#service').selectedIndex >= 0 && collAddress && $w('#collectionDate').value && $w('#collectionTime').value.length > 0) {
        scr1Validate(false);
        $w('#summaryCollectionAddress').text = collAddress.formatted
        $w('#summaryCollectionDateTime').text = date.toDateString() + " " + $w('#collectionTime').value.toString()
        $w('#mainStateBox').changeState("State2")
        getTimeslots(date, 'delivery', delAddress, sessionId)
            .then(data => {
                // timeslots come pre-filtered with the booking cut-off window
                let answer = filterDeliveryTimeslots(data);
                const times12Hour = convertTo12HourFormat(answer);
                updateTimeDropdown($w("#deliveryTime"), times12Hour, answer, 'Delivery time')
            })
            .catch(error => {
                logger.error(sessionId, 'Delivery timeslots error', error);
            });
        $w('#mainStateBox').scrollTo();
        logger.log(sessionId, "scrTransition", "2");
        updatePrice();
    } else {
        scr1Validate(true);
    }
}

// Toggle validation highlight on (true) or off (false) for scr3 components
function scr2Validate(val) {
    const addr = getAddressValue('delivery');
    if (val) {
        $w('#deliveryTerminal').updateValidityIndication();
        // specifically for address, remove invalid (hand-crafted) values
        if (!addr) {
            $w('#deliveryAddress').value = undefined;
            $w('#deliveryAddress').updateValidityIndication();
        }
        $w('#deliveryDate').updateValidityIndication();
        $w('#deliveryTime').updateValidityIndication();
        $w('#flightCity').updateValidityIndication();
        $w('#airline').updateValidityIndication();
        $w('#flightNumber').updateValidityIndication();

    } else {
        $w('#deliveryTerminal').resetValidityIndication();
        $w('#deliveryAddress').resetValidityIndication();
        $w('#deliveryDate').resetValidityIndication();
        $w('#deliveryTime').resetValidityIndication();
        $w('#flightCity').resetValidityIndication();
        $w('#airline').resetValidityIndication();
        $w('#flightNumber').resetValidityIndication();
    }
}

export async function scr2Continue_click(event) {
    let date = $w('#deliveryDate').value
    let time = $w('#deliveryTime').value;
    // do we have validation errors?
    let address = getAddressValue('delivery');
    if (!address || !$w('#deliveryDate').value || $w('#deliveryTime').value.length == 0) {
        scr2Validate(true);
        return;
        // additonally, if flying in/out    
    } else if (
        ($w('#service').value == "dubai-departing" || $w('#service').value == "dubai-arriving") &&
        ($w('#flightCity').value == '' || $w('#airline').value == '' || $w('#flightNumber').value == '')
    ) {
        scr2Validate(true);
        return;
    }

    scr2Validate(false);
    $w('#summaryDeliveryAddress').text = address.formatted
    $w('#summaryDeliveryDateTime').text = date.toDateString() + " " + $w('#deliveryTime').value.toString()
    $w('#mainStateBox').changeState("State3")

    // could be logged in or guest
    let member = await getUserDetails();
    if (member) {
        contactId = member.contactId;
        $w('#firstName').value = member.contactDetails.firstName;
        $w('#lastName').value = member.contactDetails.lastName;
        $w('#email').value = member.loginEmail;
        $w('#phone').value = (member.contactDetails.phones[0]) ? member.contactDetails.phones[0].toString() : '';
    } else {
        contactId = 'guest';
    }
    logger.log(sessionId, "scrTransition", "3");
}

async function getUserDetails() {
    let user = await wixMembers.currentMember;
    if (user) {
        return user.getMember();
    }
    return undefined;
}

export function service_change(event) {
    if ($w('#service').value == "dubai-departing") {
        showFlightDetailsGroup('Flying to');
        toggleTerminalDropdown('delivery', true);
        toggleTerminalDropdown('collection', false);
    } else if ($w('#service').value == "dubai-arriving") {
        $w('#collectionTerminal').options = $w('#collectionTerminal').options.slice(0, 1)
        showFlightDetailsGroup('Flying from');
        toggleTerminalDropdown('collection', true);
        toggleTerminalDropdown('delivery', false);
    } else if ($w('#service').value == "uae-storage") {
        $w('#flightDetailsGroup').collapse();
        toggleTerminalDropdown('delivery', false);
        toggleTerminalDropdown('collection', false);
    } else if ($w('#service').value == "uae-pickup") {
        $w('#flightDetailsGroup').collapse()
        toggleTerminalDropdown('delivery', false);
        toggleTerminalDropdown('collection', false);
    }
    updateItemsDropdownForService();
}

function showFlightDetailsGroup(text) {
    $w('#flightDetailsGroup').expand()
    $w('#flightCity').label = text
    $w('#flightCity').placeholder = text
}

export async function collectionGpsLink_click(event) {
    const address = await wixWindow.openLightbox("gpslocation", { service: 'Collection' });
    if (address != null) {
        $w('#collectionAddress').value = address;
    }
}

// Show the terminal dropdown and hide the others (on) or vice-versa
function toggleTerminalDropdown(page, on) {
    let address, terminal, instructions, addressValidation, gpsLink = undefined
    if (page == 'collection') {
        address = $w('#collectionAddress');
        terminal = $w('#collectionTerminal');
        instructions = $w('#collectionComments');
        addressValidation = $w('#collectionAddressValidation');
        gpsLink = $w('#collectionGpsLink');
    } else {
        address = $w('#deliveryAddress');
        terminal = $w('#deliveryTerminal');
        instructions = $w('#deliveryInstructions');
        addressValidation = $w('#deliveryAddressValidation');
        gpsLink = $w('#deliveryGpsLink');
    }
    addressValidation.collapse();
    if (on) {
        terminal.expand();
        address.collapse();
        instructions.collapse();
        gpsLink.collapse();
    } else {
        terminal.collapse();
        address.expand();
        instructions.expand();
        gpsLink.expand();
    }
}

// If service == uae-pickup -> reduce items options to 6
//   If items selection > 6 -> set selection to 1 and recalculate price
// else increase them to 10 and keep items value the same
function updateItemsDropdownForService() {
    const svcDropDown = $w('#service');
    const itemsDropDown = $w('#itemsDropdown')
    const svcValue = svcDropDown.value;
    const itemsValue = itemsDropDown.value;
    let items = 0;
    if (svcValue == "uae-pickup") {
        items = 6;
    } else {
        items = 10;
    }
    // do we need to make a change?
    //   if yes, update options and change price
    if (items != itemsDropDown.options.length) {
        itemsDropDown.options = [];
        let arr = [];
        for (let i = 1; i <= items; i++) {
            arr.push({ "value": String(i), "label": String(i) });
        }
        itemsDropDown.options = arr;
        // do we need to change selection?
        if (Number(itemsValue) > Number(6) && svcValue == "uae-pickup") {
            itemsDropDown.value = "1";
            itemsDropDown.selectedIndex = 0;
        }
        updatePrice();
    }
}

export async function deliveryGpsLink_click(event) {
    const address = await wixWindow.openLightbox("gpslocation", { service: 'Delivery' });
    if (address != null) {
        $w('#deliveryAddress').value = address;
    }

}

export function scr2GoBack_click(event) {
    $w('#mainStateBox').changeState("State1");
    $w('#mainStateBox').scrollTo();
    logger.log(sessionId, "scrTransition", "1");
}

export function scr3GoBack_click(event) {
    $w('#mainStateBox').changeState("State2");
    $w('#mainStateBox').scrollTo();
    logger.log(sessionId, "scrTransition", "2");
}

export function scr4GoBack_click(event) {
    $w('#mainStateBox').changeState("State3");
    $w('#mainStateBox').scrollTo();
    logger.log(sessionId, "scrTransition", "3");
}

// Create a human-readable service description for the generate invoice
// DO NOT MODIFY: This description is used to link the payment in the backend.  
function createInvoiceDescription(bookingId, service, items, fromAddr, fromDate, toAddr, toDate) {
    let desc = '';
    desc += `Booking ID: ${bookingId} | `;
    desc += `Service: ${service} | `;
    desc += `Baggage Items: ${items} | `;
    desc += `From: ${fromAddr.formatted} | `;
    desc += `Collection: ${fromDate} | `;
    desc += `To: ${toAddr.formatted} | `;
    desc += `Delivery: ${toDate}`;
    return desc;
}

export function payNowButton_click(event) {
    if (!$w('#acceptPolicy').checked || !$w('#acceptTandC').checked || !$w('#creditCard').checked) {
        scr4Validate(true);
    } else {
        logger.log(sessionId, "scrTransition", "pay");

        const collAddress = getAddressValue('collection');
        const delAddress = getAddressValue('delivery');
        const collDate = $w('#collectionDate').value.toDateString()
        const delDate = $w('#deliveryDate').value.toDateString()
        const items = $w('#itemsDropdown').value
        const svc = $w('#service').value
        const description = createInvoiceDescription(bookingId, svc, items, collAddress, collDate, delAddress, delDate);
        const email = $w('#email').value
        const phone = $w('#phone').value
        const fname = $w('#firstName').value
        const lname = $w('#lastName').value

        scr4Validate(false);
        const data = submitFormData(bookingId);
        if (member) {
            payNow();
        } else {
            wixMembers.authentication.promptLogin({
                modal: false,
                mode: 'login'
            }).then((res) => {
                console.log(res);
                payNow()
            })
        }
        // createMyPayment(description, orderPrice, email, fname, lname, phone)
        //     .then((payment) => {
        //         wixPay.startPayment(
        //                 payment.id, {
        //                     showThankYouPage: false,
        //                     skipUserInfoPage: true,
        //                 })
        //             .then((result) => {
        //                 logger.log(sessionId, `Start payment. Payment id: ${result.payment.id}. Trx Id: ${result.transactionId}`);

        //                 if (result.status == "Successful") {
        //                     logger.log(sessionId, "scrTransition", "finish");
        //                     logger.log(sessionId, "payment successful");
        //                     createTaskforPickup() // Tookan
        //                     wixWindow.openLightbox("thankyou", data);
        //                 } else {
        //                     let data = {};
        //                     if (result.status === "Pending") {
        //                         logger.log(sessionId, "payment Pending");
        //                         data.title = 'Payment pending';
        //                         data.subtitle = 'The funds have not left your account yet';
        //                         data.explanation = 'This is taking more than usual. Check with your bank to make sure the payment is not withheld';
        //                         data.callToAction = 'Once the payment is cleared, you will receive a confirmation e-mail';
        //                     } else if (result.status === "Failed") {
        //                         logger.log(sessionId, "payment Failed");
        //                         data.title = 'Payment failed';
        //                         data.subtitle = 'We could not complete the payment';
        //                         data.explanation = 'Were the card details correct? Was the payment declined by the bank?';
        //                         data.callToAction = 'Please try again. Maybe use a different card this time?';
        //                     } else {
        //                         logger.log(sessionId, "payment Cancelled");
        //                         data.title = 'Payment cancelled';
        //                         data.subtitle = 'We could not complete the payment';
        //                         data.explanation = 'Did you accidentally cancel the payment?';
        //                         data.callToAction = 'Please try again. Your booking will be finalised once the payment completes';
        //                     }
        //                     wixWindow.openLightbox("paymentfailed", data);
        //                 }
        //             });
        //     })
    }
}

export function itemsDropdown_change(event) {
    updatePrice();
    $w('#summaryItems').text = event.target.value;
}

// When the deliveryDate changes, fetch the avalable delivery timeslots
export function deliveryDate_change_1(event) {
    const date = $w("#deliveryDate").value;
    let collDateValue = $w("#collectionDate").value;
    let currentDate = $w('#deliveryDate').value;

    // Set the time to midnight for both dates to compare only the date value
    collDateValue.setHours(0, 0, 0, 0);
    currentDate.setHours(0, 0, 0, 0);

    updatePrice();

    pleaseWait($w("#deliveryTime"))
    let address = getAddressValue('delivery');
    getTimeslots(date, 'delivery', address, sessionId)
        .then(data => {
            // timeslots come pre-filtered with the 6h booking time-window
            let answer = filterDeliveryTimeslots(data);
            const times12Hour = convertTo12HourFormat(answer);
            updateTimeDropdown($w("#deliveryTime"), times12Hour, answer, 'Delivery time')
        })
        .catch(error => {
            logger.error(sessionId, 'Error fetching timeslots', error);
        });
}

// When collectionDate changes, fetch the available collection timeslots
export function collectionDate_change1(event) {
    const date = $w("#collectionDate").value;
    $w('#deliveryDate').minDate = date
    $w('#deliveryDate').value = date

    pleaseWait($w("#collectionTime"))
    let address = getAddressValue('collection');
    getTimeslots(date, 'collection', address, sessionId)
        .then(data => {
            // timeslots come pre-filtered with the 6h booking cut-off
            const times12Hour = convertTo12HourFormat(data);
            updateTimeDropdown($w("#collectionTime"), times12Hour, data, 'Collection time')
        })
        .catch(error => {
            logger.error(sessionId, 'Error fetching timeslots', error);
        });
}

// Set the placeholder of a time dropdown and resetting the value
export function pleaseWait(timeDropDown) {
    timeDropDown.placeholder = 'Fetching timeslots...';
    timeDropDown.required = false;
}

// Set the items and the placeholder text of the dropdown, depending on the array of items
// If array is empty, set to 'No timeslots'
// Otherwise, set to the default text
function updateTimeDropdown(dropDown, itemLabels, itemValues, defaultText) {
    dropDown.options = [];
    if (Array.isArray(itemLabels) && itemLabels.length > 0) {
        dropDown.options = itemLabels.map((label, index) => {
            return { label: label, value: itemValues[index] };
        });
        dropDown.placeholder = defaultText;
        dropDown.selectedIndex = 0;
    } else {
        dropDown.placeholder = 'No timeslots';
        dropDown.selectedIndex = undefined;
    }
    dropDown.required = true;
}

function updatePrice() {
    const service = $w('#service').value
    let svc = '';
    switch (service) {
    case 'dubai-departing':
    case 'dubai-arriving':
        svc = 'dubai-pickup-delivery';
        break;
    case 'uae-storage':
        svc = 'uae-storage';
        break;
    case 'uae-pickup':
        svc = 'uae-pickup-delivery';
        break;
    default:
        // this is for when no service has been selected yet 
        svc = 'dubai-pickup-delivery';
    }
    const coll = getDateinISOFormat($w('#collectionDate'), $w('#collectionTime'));
    const del = getDateinISOFormat($w('#deliveryDate'), $w('#deliveryTime'));
    const items = $w('#itemsDropdown').value;

    getPrice(svc, coll, del, items, "AED", sessionId).then((data) => {
        let handlingPrice = String(data.handlingFee) + "\u00A0AED";
        let storagePrice = String(data.storageFee) + "\u00A0AED";
        $w('#summaryHandlingFee').text = handlingPrice;
        $w('#summaryStorageFee').text = storagePrice;
        // hide summary storage fee if zero
        if (data.storageFee == 0) {
            $w('#storageFeeGroup').collapse();
        } else {
            $w('#storageFeeGroup').expand();
        }
        // update global variable
        orderPrice = Number(data.handlingFee) + Number(data.storageFee);

        const orderPriceStr = String(orderPrice) + '\u00A0AED';
        $w('#scr1Price').text = orderPriceStr;
        $w('#scr2Price').text = orderPriceStr;
        $w('#summaryTotalPrice').text = orderPriceStr;
    });
}

export function deliveryTime_change(event) {
    updatePrice();
}

// Toggle validation highlights on (true) or off (false) for scr4 components
function scr4Validate(val) {
    const errText = !$w('#creditCard').checked ?
        'Please confirm the payment method' :
        'You must accept our T&C and Priv. Policy';
    $w('#termsError').text = errText;
    if (val) {
        $w('#creditCard').updateValidityIndication();
        $w('#acceptTandC').updateValidityIndication();
        $w('#acceptPolicy').updateValidityIndication();
        $w('#termsError').expand();
    } else {
        $w('#creditCard').resetValidityIndication();
        $w('#acceptTandC').resetValidityIndication();
        $w('#acceptPolicy').resetValidityIndication();
        $w('#termsError').collapse();
    }
}

function toggleSubmissionButtons(showFlag) {
    if (showFlag) {
        if ($w('#creditCard').value === "cash") {
            $w('#submitButton').expand()
            $w('#submitButton').show()
            $w('#payNowButton').collapse()
            $w('#payNowButton').hide()
        } else {
            $w('#submitButton').collapse()
            $w('#submitButton').hide()
            $w('#payNowButton').expand()
            $w('#payNowButton').show()
        }
    } else {
        $w('#submitButton').collapse()
        $w('#submitButton').hide()
        $w('#payNowButton').collapse()
        $w('#payNowButton').hide()
    }
}

// Gathers the form data and submits to the backend
function submitFormData(bookingId, transactionId) {
    let contactIndex = $w("#contactRadioGroup").selectedIndex

    let collDateTime = getDateinISOFormat($w('#collectionDate'), $w('#collectionTime'))
    let delDateTime = getDateinISOFormat($w('#deliveryDate'), $w('#deliveryTime'))
    let trxId = (transactionId) ? transactionId : '';

    // values for confirmation screen
    let collDate = $w('#collectionDate').value.toDateString()
    let delDate = $w('#deliveryDate').value.toDateString()
    let collAddress = getAddressValue('collection');
    let delAddress = getAddressValue('delivery');
    let affiliateId = getAffiliateId(sessionId);
    let data = {
        contactId: contactId,
        phoneNumber: $w('#phone').value,
        pickupDateTime: collDateTime,
        email: $w('#email').value,
        deliveryDateTime: delDateTime,
        pickupLocation: collAddress,
        termsPolicy: $w('#acceptPolicy').checked,
        termsTandC: $w('#acceptTandC').checked,
        firstName: $w('#firstName').value,
        lastName: $w('#lastName').value,
        paymentMethod: $w("#creditCard").value,
        contactPermission: $w("#contactRadioGroup").options[contactIndex].value,
        dropLocation: delAddress,
        pickupComment: $w('#collectionComments').value,
        deliveryComment: $w('#deliveryInstructions').value,
        flyingTo: $w('#flightCity').value,
        whichAirline: $w('#airline').value,
        flightNumber: $w('#flightNumber').value,
        numberOfBags: Number($w('#itemsDropdown').value),
        service: $w('#service').value,
        bookingId: String(bookingId),
        price: String(orderPrice),
        transactionId: String(trxId),
        // values for the confirmation screen
        pickupDate: collDate,
        pickupTime: $w('#collectionTime').value,
        deliveryDate: delDate,
        deliveryTime: $w('#deliveryTime').value,
        affiliateId: affiliateId,
    }

    // send the data
    logger.log(sessionId, 'Sending booking data');
    const dataStr = JSON.stringify(data);
    submitBooking(dataStr, sessionId)
        .then((err) => {
            if (!err) {
                logger.log(sessionId, 'Booking data sent');
            } else {
                logger.error(sessionId, 'Error sending booking data', err);
            }
        })
    return data
}

const dubaiGeofence = [
    { lat: 24.96366029422423, lng: 54.77287369364891 },
    { lat: 24.741852607830495, lng: 55.14778212554692 },
    { lat: 25.21986079308209, lng: 55.631180543232254 },
    { lat: 25.396151760879306, lng: 55.23567274694426 },
];

function isPointInDubai(lat, lng) {
    let inside = false;
    for (let i = 0, j = dubaiGeofence.length - 1; i < dubaiGeofence.length; j = i++) {
        const xi = dubaiGeofence[i].lat,
            yi = dubaiGeofence[i].lng;
        const xj = dubaiGeofence[j].lat,
            yj = dubaiGeofence[j].lng;

        const intersect = ((yi > lng) !== (yj > lng)) && (lat < (xj - xi) * (lng - yi) / (yj - yi) + xi);
        if (intersect) inside = !inside;
    }
    return inside;
}

// options for terminal dropdowns
const terminals = {
    "dxb-terminal1": {
        label: "Terminal 1, Dubai International Airport",
        address: {
            city: "Dubai",
            location: {
                latitude: 25.2488352,
                longitude: 55.3529860,
            },
            streetAddress: {
                number: "",
                name: "Terminal 1",
                apt: "",
                formattedAddressLine: "Terminal 1"
            },
            formatted: "Dubai International Airport - Dubai - United Arab Emirates",
            country: "AE"
        }
    },
    "dxb-terminal2": {
        label: "Terminal 2, Dubai International Airport",
        address: {
            city: "Dubai",
            location: {
                latitude: 25.2663995,
                longitude: 55.3569681,
            },
            streetAddress: {
                number: "",
                name: "Terminal 2",
                apt: "",
                formattedAddressLine: "Terminal 2"
            },
            formatted: "Dubai International Airport - Dubai - United Arab Emirates",
            country: "AE"
        }
    },
    "dxb-terminal3": {
        label: "Terminal 3, Dubai International Airport",
        address: {
            city: "Dubai",
            location: {
                latitude: 25.2453432,
                longitude: 55.3598691,
            },
            streetAddress: {
                number: "",
                name: "Terminal 3",
                apt: "",
                formattedAddressLine: "Terminal 3"
            },
            formatted: "Dubai International Airport - Dubai - United Arab Emirates",
            country: "AE"
        }
    },
};

const airlineNames = [
    { name: "Aegean Airlines", code: "A3" },
    { name: "Aer Lingus", code: "EI" },
    { name: "Aeroflot", code: "SU" },
    { name: "Air Algerie", code: "AH" },
    { name: "Air Astana", code: "KC" },
    { name: "Air Baltic", code: "BT" },
    { name: "Air Canada", code: "AC" },
    { name: "Air China", code: "CA" },
    { name: "Air France", code: "AF" },
    { name: "Air India", code: "AI" },
    { name: "Air India Express", code: "IX" },
    { name: "Air Mauritius", code: "MK" },
    { name: "Air New Zealand", code: "NZ" },
    { name: "Air Peace", code: "P4" },
    { name: "Airblue", code: "PA" },
    { name: "All Nippon Airways - ANA", code: "NH" },
    { name: "American Airlines", code: "AA" },
    { name: "Ariana Afghan Airlines", code: "FG" },
    { name: "Arkia Israeli Airlines", code: "IZ" },
    { name: "ASKY", code: "KP" },
    { name: "AZAL Azerbaijan Airlines", code: "J2" },
    { name: "Azimuth Airlines", code: "A4" },
    { name: "Azur Air", code: "ZF" },
    { name: "Badr Airlines", code: "J4" },
    { name: "Belavia", code: "B2" },
    { name: "Biman Bangladesh Airlines", code: "BG" },
    { name: "British Airways", code: "BA" },
    { name: "Cathay Pacific", code: "CX" },
    { name: "Cebu Pacific", code: "5J" },
    { name: "China Eastern Airlines", code: "MU" },
    { name: "China Southern Airlines", code: "CZ" },
    { name: "Czech Airlines", code: "OK" },
    { name: "Daallo Airlines", code: "D3" },
    { name: "Delta Air Lines", code: "DL" },
    { name: "Drukair", code: "KB" },
    { name: "Egyptair", code: "MS" },
    { name: "El Al Israel Airlines", code: "LY" },
    { name: "Emirates", code: "EK" },
    { name: "Enter Air", code: "OF" },
    { name: "Ethiopian Airlines", code: "ET" },
    { name: "Finnair", code: "AY" },
    { name: "FitsAir", code: "8D" },
    { name: "FlexFlight", code: "W2" },
    { name: "Fly Baghdad", code: "IF" },
    { name: "flyadeal", code: "F3" },
    { name: "flydubai", code: "FZ" },
    { name: "flynas", code: "XY" },
    { name: "Garuda Indonesia", code: "GA" },
    { name: "Go First", code: "G8" },
    { name: "Gulf Air", code: "GF" },
    { name: "Himalaya Airlines", code: "H9" },
    { name: "Iberia", code: "IB" },
    { name: "IndiGo", code: "6E" },
    { name: "Iran Air", code: "IR" },
    { name: "Iraqi Airways", code: "IA" },
    { name: "Israir", code: "6H" },
    { name: "JAL - Japan Airlines", code: "JL" },
    { name: "Jazeera Airways", code: "J9" },
    { name: "JetBlue Airways", code: "B6" },
    { name: "Jordan Aviation Airlines", code: "R5" },
    { name: "Kam Air", code: "RQ" },
    { name: "Kenya Airways", code: "KQ" },
    { name: "KLM Royal Dutch Airlines", code: "KL" },
    { name: "Korean Air", code: "KE" },
    { name: "Kuwait Airways", code: "KU" },
    { name: "LAM Mozambique Airlines", code: "TM" },
    { name: "LOT Polish Airlines", code: "LO" },
    { name: "Lufthansa", code: "LH" },
    { name: "Luxair", code: "LG" },
    { name: "Mahan Air", code: "W5" },
    { name: "Malaysia Airlines", code: "MH" },
    { name: "Middle East Airlines", code: "ME" },
    { name: "Myanmar Airways International", code: "8M" },
    { name: "Neos", code: "NO" },
    { name: "Nepal Airlines", code: "RA" },
    { name: "Nordwind Airlines", code: "N4" },
    { name: "Oman Air", code: "WY" },
    { name: "Pakistan International Airlines", code: "PK" },
    { name: "Pegasus Airlines", code: "PC" },
    { name: "Philippine Airlines", code: "PR" },
    { name: "Pobeda", code: "DP" },
    { name: "Qantas", code: "QF" },
    { name: "Qatar Airways", code: "QR" },
    { name: "Rossiya-Russian Airlines", code: "FV" },
    { name: "Royal Air Maroc", code: "AT" },
    { name: "Royal Brunei Airlines", code: "BI" },
    { name: "Royal Flight", code: "4R" },
    { name: "Royal Jordanian", code: "RJ" },
    { name: "RwandAir", code: "WB" },
    { name: "S7 Airlines", code: "S7" },
    { name: "SalamAir", code: "OV" },
    { name: "Saudia", code: "SV" },
    { name: "Serene Air", code: "ER" },
    { name: "Sichuan Airlines", code: "3U" },
    { name: "Singapore Airlines", code: "SQ" },
    { name: "SmartWings", code: "QS" },
    { name: "Somon Air", code: "SZ" },
    { name: "South African Airways", code: "SA" },
    { name: "SpiceJet", code: "SG" },
    { name: "SriLankan Airlines", code: "UL" },
    { name: "SunExpress", code: "XQ" },
    { name: "SWISS", code: "LX" },
    { name: "Syrian Air", code: "RB" },
    { name: "TAP Air Portugal", code: "TP" },
    { name: "Tarco Aviation", code: "3T" },
    { name: "Thai Airways International", code: "TG" },
    { name: "Transavia", code: "HV" },
    { name: "Tunisair", code: "TU" },
    { name: "Turkish Airlines", code: "TK" },
    { name: "Turkmenistan Airlines", code: "T5" },
    { name: "Uganda Airlines", code: "UR" },
    { name: "Ukraine International Airlines", code: "PS" },
    { name: "United Airlines", code: "UA" },
    { name: "Ural Airlines", code: "U6" },
    { name: "US-Bangla Airlines", code: "BS" },
    { name: "UTair", code: "UT" },
    { name: "Uzbekistan Airways", code: "HY" },
    { name: "Vietnam Airlines", code: "VN" },
    { name: "Vistara", code: "UK" },
    { name: "Wizz Air", code: "W6" },
    { name: "Zambia Airways", code: "ZN" },
];

const airports = [
    { name: "Abu Dhabi", code: "AUH" },
    { name: "Adelaide", code: "ADL" },
    { name: "Amsterdam Schiphol", code: "AMS" },
    { name: "Antalya", code: "AYT" },
    { name: "Athens", code: "ATH" },
    { name: "Auckland", code: "AKL" },
    { name: "Austin-Bergstrom", code: "AUS" },
    { name: "Barcelona–El Prat", code: "BCN" },
    { name: "Beijing Capital", code: "PEK" },
    { name: "Berlin Tegel", code: "TXL" },
    { name: "Bogotá El Dorado", code: "BOG" },
    { name: "Boston Logan", code: "BOS" },
    { name: "Brussels", code: "BRU" },
    { name: "Budapest Ferenc Liszt", code: "BUD" },
    { name: "Cairo", code: "CAI" },
    { name: "Calgary", code: "YYC" },
    { name: "Cancún", code: "CUN" },
    { name: "Chengdu Shuangliu", code: "CTU" },
    { name: "Chhatrapati Shivaji Maharaj", code: "BOM" },
    { name: "Chicago Midway", code: "MDW" },
    { name: "Chicago O'Hare", code: "ORD" },
    { name: "Chongqing Jiangbei", code: "CKG" },
    { name: "Christchurch", code: "CHC" },
    { name: "Cincinnati/Northern Kentucky", code: "CVG" },
    { name: "Copenhagen", code: "CPH" },
    { name: "Dalian Zhoushuizi", code: "DLC" },
    { name: "Dallas/Fort Worth", code: "DFW" },
    { name: "Denver", code: "DEN" },
    { name: "Detroit Metropolitan", code: "DTW" },
    { name: "Domodedovo", code: "DME" },
    { name: "Dubai", code: "DXB" },
    { name: "Dublin", code: "DUB" },
    { name: "Düsseldorf", code: "DUS" },
    { name: "Edmonton", code: "YEG" },
    { name: "Ezeiza", code: "EZE" },
    { name: "Fiumicino – Leonardo da Vinci", code: "FCO" },
    { name: "Fort Lauderdale–Hollywood", code: "FLL" },
    { name: "Frankfurt", code: "FRA" },
    { name: "Geneva", code: "GVA" },
    { name: "George Bush Intercontinental", code: "IAH" },
    { name: "Gimpo", code: "GMP" },
    { name: "Halifax Stanfield", code: "YHZ" },
    { name: "Hamburg", code: "HAM" },
    { name: "Haneda", code: "HND" },
    { name: "Hartsfield–Jackson Atlanta", code: "ATL" },
    { name: "Heathrow", code: "LHR" },
    { name: "Helsinki", code: "HEL" },
    { name: "Hong Kong", code: "HKG" },
    { name: "Honolulu Daniel K. Inouye", code: "HNL" },
    { name: "Houston William P. Hobby", code: "HOU" },
    { name: "Indira Gandhi", code: "DEL" },
    { name: "Incheon", code: "ICN" },
    { name: "Istanbul Atatürk", code: "IST" },
    { name: "JFK", code: "JFK" },
    { name: "Kansai", code: "KIX" },
    { name: "Kansas City", code: "MCI" },
    { name: "Keflavik", code: "KEF" },
    { name: "Kempegowda", code: "BLR" },
    { name: "King Abdulaziz", code: "JED" },
    { name: "King Khalid", code: "RUH" },
    { name: "Kuala Lumpur", code: "KUL" },
    { name: "Kunming Changshui", code: "KMG" },
    { name: "LaGuardia", code: "LGA" },
    { name: "Lisbon", code: "LIS" },
    { name: "Los Angeles", code: "LAX" },
    { name: "Lyon–Saint-Exupéry", code: "LYS" },
    { name: "Madrid–Barajas", code: "MAD" },
    { name: "Málaga", code: "AGP" },
    { name: "Manchester", code: "MAN" },
    { name: "Melbourne", code: "MEL" },
    { name: "Miami", code: "MIA" },
    { name: "Minneapolis–Saint Paul", code: "MSP" },
    { name: "Montreal–Pierre Elliott Trudeau", code: "YUL" },
    { name: "Munich", code: "MUC" },
    { name: "Nagoya Chubu Centrair", code: "NGO" },
    { name: "Nanjing Lukou", code: "NKG" },
    { name: "Narita", code: "NRT" },
    { name: "Newark Liberty", code: "EWR" },
    { name: "Nice Côte d'Azur", code: "NCE" },
    { name: "Ninoy Aquino", code: "MNL" },
    { name: "Orlando", code: "MCO" },
    { name: "Oslo", code: "OSL" },
    { name: "Ottawa Macdonald–Cartier", code: "YOW" },
    { name: "Palma de Mallorca", code: "PMI" },
    { name: "Paris Charles de Gaulle", code: "CDG" },
    { name: "Paris Orly", code: "ORY" },
    { name: "Perth", code: "PER" },
    { name: "Philadelphia", code: "PHL" },
    { name: "Phoenix Sky Harbor", code: "PHX" },
    { name: "Piarco", code: "POS" },
    { name: "Pittsburgh", code: "PIT" },
    { name: "Portland", code: "PDX" },
    { name: "Prague Václav Havel", code: "PRG" },
    { name: "Qingdao Liuting", code: "TAO" },
    { name: "Queen Alia", code: "AMM" },
    { name: "Rajiv Gandhi", code: "HYD" },
    { name: "Raleigh–Durham", code: "RDU" },
    { name: "Rio de Janeiro–Galeão", code: "GIG" },
    { name: "Salt Lake City", code: "SLC" },
    { name: "San Diego", code: "SAN" },
    { name: "San Francisco", code: "SFO" },
    { name: "Seattle–Tacoma", code: "SEA" },
    { name: "Shanghai Hongqiao", code: "SHA" },
    { name: "Shanghai Pudong", code: "PVG" },
    { name: "Shenzhen Bao'an", code: "SZX" },
    { name: "Singapore Changi", code: "SIN" },
    { name: "Soekarno–Hatta", code: "CGK" },
    { name: "Stockholm Arlanda", code: "ARN" },
    { name: "Stuttgart", code: "STR" },
    { name: "Suvarnabhumi", code: "BKK" },
    { name: "Sydney", code: "SYD" },
    { name: "Taiwan Taoyuan", code: "TPE" },
    { name: "Tampa", code: "TPA" },
    { name: "Ted Stevens Anchorage", code: "ANC" },
    { name: "Tokyo Haneda", code: "HND" },
    { name: "Tokyo Narita", code: "NRT" },
    { name: "Toronto Pearson", code: "YYZ" },
    { name: "Toulouse–Blagnac", code: "TLS" },
    { name: "Vancouver", code: "YVR" },
    { name: "Vienna", code: "VIE" },
    { name: "Washington Dulles", code: "IAD" },
    { name: "Washington Ronald Reagan National", code: "DCA" },
    { name: "Wellington", code: "WLG" },
    { name: "Xi'an Xianyang", code: "XIY" },
    { name: "Xiamen Gaoqi", code: "XMN" },
    { name: "Zurich", code: "ZRH" },
];

// Filter items for the repeater
export function flightCity_input(event) {
    const searchValue = event.target.value.toLowerCase();

    if (searchValue == '') {
        $w('#flightCityRepeater').collapse();
        return;
    }

    const filteredAirports = airports.filter(airport =>
        airport.name.toLowerCase().includes(searchValue) ||
        airport.code.toLowerCase().includes(searchValue)
    ).slice(0, 3).
    map((airport) => {
        return {
            '_id': airport.code,
            'name': airport.name,
            'code': airport.code,
        }
    });

    $w('#flightCityRepeater').data = filteredAirports;
    if (filteredAirports.length > 0) {
        $w('#flightCityRepeater').expand();
    } else {
        $w('#flightCityRepeater').collapse();
    }
}

// Dynamically populate the flight city repeater with data
export function flightCityRepeater_itemReady($item, itemData, index) {
    $item('#flightCityText').text = `${itemData.name} (${itemData.code})`;
    $item('#flightCityText').onClick(() => {
        $w('#flightCity').value = `${itemData.name} (${itemData.code})`;
        $w('#flightCityRepeater').collapse();
    });
}

// Filter airlines 
export function airline_input(event) {
    const searchValue = event.target.value.toLowerCase();

    if (searchValue == '') {
        $w('#airlineRepeater').collapse();
        return;
    }

    const filteredAirlines = airlineNames.filter(airline =>
        airline.name.toLowerCase().includes(searchValue) ||
        airline.code.toLowerCase().includes(searchValue)
    ).slice(0, 3).
    map((airline) => {
        return {
            '_id': airline.code,
            'name': airline.name,
            'code': airline.code,
        }
    });

    $w('#airlineRepeater').data = filteredAirlines;
    if (filteredAirlines.length > 0) {
        $w('#airlineRepeater').expand();
    } else {
        $w('#airlineRepeater').collapse();
    }
}

// Prepare items to be added to the list
export function airlineRepeater_itemReady($item, itemData, index) {
    $item('#airlineText').text = `${itemData.name} (${itemData.code})`;
    $item('#airlineText').onClick(() => {
        $w('#airline').value = `${itemData.name} (${itemData.code})`;
        $w('#airlineRepeater').collapse();
    });
}

/**
*	Adds an event handler that runs when the element is clicked.
	[Read more](https://www.wix.com/corvid/reference/$w.ClickableMixin.html#onClick)
*	 @param {$w.MouseEvent} event
*/
export function button1_click(event) {
    createTaskforPickup()
}