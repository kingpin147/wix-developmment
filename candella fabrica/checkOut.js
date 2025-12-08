import { myGetCurrentCartFunction, myGetCheckoutFunction } from 'backend/currentCart.web';
import { createMyOrder, updateMyOrderPaymentStatus } from 'backend/order.web';
import { createMyPayment } from 'backend/wixPay.web';
import wixPay from "wix-pay";
import wixData from "wix-data";
import wixEcomFrontend from "wix-ecom-frontend";

let items = [];
let shippingCost = 0; // Shipping cost from checkout or radio override
let taxAmount = 0; // GST/Tax amount from checkout
let currentCheckout = null; // Store checkout data
let country = "AU", // Default to Australia
    city = null,
    subdivision = null,
    postalCode = null,
    addressLine = null;

// Country name to ISO 2-letter code mapping
const COUNTRY_CODE_MAP = {
    "Australia": "AU",
    // Add more countries as needed
};

// Function to convert country name to ISO code
function getCountryCode(countryNameOrCode) {
    if (!countryNameOrCode) return "AU"; // Default to Australia

    // If already 2-letter code, return as-is
    if (countryNameOrCode.length === 2) {
        return countryNameOrCode.toUpperCase();
    }

    // Otherwise look up in mapping
    return COUNTRY_CODE_MAP[countryNameOrCode] || "AU"; // Fallback to Australia
}

$w.onReady(async () => {
    console.log("Checkout page loaded");

    // Initially collapse shipping, order summary, and error messages
    try {
        $w('#orderSummary').collapse();
        console.log("orderSummary collapsed initially");
    } catch (e) {
        console.error("Error collapsing orderSummary - element may not exist:", e);
    }

    $w('#shippingContainer').collapse();
    $w('#errorMessage1').collapse();
    $w('#errorMessage2').collapse();
    $w('#paymentButton').disable();

    // Load cart data into orderSummary
    await loadCartAndBind();

    // Listen for cart changes
    wixEcomFrontend.onCartChange(async () => {
        console.log("Cart changed — refreshing...");
        await loadCartAndBind();
    });

    // ===== DETAILS BUTTON - Get customer and shipping details =====
    $w('#detailsButton').onClick(async () => {
        console.log("Details button clicked");

        // Hide previous errors
        $w('#errorMessage1').collapse();

        // Validate customer details
        const email = $w('#email').value?.trim();
        const firstName = $w('#firstName').value?.trim();
        const lastName = $w('#lastName').value?.trim();
        const phone = $w('#phoneNumber').value?.trim();

        // Validate shipping details
        const selectedCountry = $w('#countryDropdown').value;
        const address = $w('#addressInput').value?.trim();
        const selectedCity = $w('#cityInput').value?.trim();
        const selectedSubdivision = $w('#stateDropdown').value;
        const selectedPostalCode = $w('#postcodeInput').value?.trim();

        // Check if any field is missing
        if (!email || !firstName || !lastName || !phone ||
            !selectedCountry || !address || !selectedCity ||
            !selectedSubdivision || !selectedPostalCode) {

            $w('#errorMessage1').text = "Please fill in all required fields in Customer and Delivery Details.";
            $w('#errorMessage1').expand();
            return;
        }

        // Validate email format
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            $w('#errorMessage1').text = "Please enter a valid email address.";
            $w('#errorMessage1').expand();
            return;
        }

        // Store shipping info with proper country code conversion
        country = getCountryCode(selectedCountry);
        city = selectedCity;
        subdivision = selectedSubdivision;
        postalCode = selectedPostalCode;
        addressLine = address;

        console.log("Shipping info stored:", { country, city, subdivision, postalCode });

        console.log("All details validated successfully");

        // Collapse detailContainer and expand shippingContainer
        $w('#detailContainer').collapse();
        $w('#shippingContainer').expand();

        // Enable payment button by default after details are complete
        $w('#paymentButton').enable();
    });

    // ===== SHIPPING RADIO - Handle shipping cost selection =====
    $w('#shippingRadio').onChange(async (event) => {
        const selectedValue = event.target.value;
        console.log("Shipping method selected, raw value:", selectedValue);

        // Radio values are direct numbers: "0" or "23.99"
        shippingCost = parseFloat(selectedValue) || 0;

        console.log("Shipping cost updated to:", shippingCost);

        // Immediately update the order summary display
        await updateOrderSummaryDisplay();
        console.log("Order summary display updated with new shipping");
        console.log("Order summary display updated with new shipping");
    });

    // ===== PAYMENT BUTTON - Process payment =====
    $w('#paymentButton').onClick(async () => {
        console.log("Payment button clicked");

        // Hide previous errors
        $w('#errorMessage2').collapse();

        try {
            // Get latest cart and checkout data
            const cart = await myGetCurrentCartFunction();
            if (!cart || !cart.lineItems || cart.lineItems.length === 0) {
                throw new Error("Your cart is empty. Please add items before checkout.");
            }

            // Calculate totals including GST
            const subtotalAmount = parseFloat(cart.subtotal?.amount || 0);
            const grandTotal = subtotalAmount + shippingCost + taxAmount;

            if (grandTotal <= 0) {
                throw new Error("Total amount must be greater than zero.");
            }

            // Prepare payment items
            const paymentItems = cart.lineItems.map(item => ({
                name: (item.productName?.original || "Item").substring(0, 100),
                price: Number(parseFloat(item.lineItemPrice?.amount || 0).toFixed(2))
            }));

            // Add shipping cost if applicable
            if (shippingCost > 0) {
                paymentItems.push({
                    name: "Shipping Cost",
                    price: Number(shippingCost.toFixed(2))
                });
            }

            // Add GST/Tax if applicable
            if (taxAmount > 0) {
                paymentItems.push({
                    name: "GST",
                    price: Number(taxAmount.toFixed(2))
                });
            }

            // Create payment
            const paymentResponse = await createMyPayment({
                items: paymentItems,
                totalPrice: Number(grandTotal.toFixed(2))
            });

            console.log("Payment created:", paymentResponse);

            // Build order object
            // Validate country code is 2-letter format
            if (!country || country.length !== 2) {
                throw new Error(`Invalid country code: ${country}. Must be 2-letter ISO code.`);
            }

            const order = {
                channelInfo: { type: "WEB" },
                currency: cart.currency || "AUD",
                buyerInfo: {
                    email: $w('#email').value?.trim(),
                    firstName: $w('#firstName').value?.trim(),
                    lastName: $w('#lastName').value?.trim(),
                    phone: $w('#phoneNumber').value?.trim()
                },
                recipientInfo: {
                    contactDetails: {
                        firstName: $w('#firstName').value?.trim(),
                        lastName: $w('#lastName').value?.trim(),
                        email: $w('#email').value?.trim(),
                        phone: $w('#phoneNumber').value?.trim()
                    },
                    address: {
                        country,
                        addressLine1: addressLine,
                        city,
                        subdivision,
                        postalCode
                    }
                },
                shippingInfo: {
                    logistics: {
                        shippingDestination: {
                            address: {
                                country,
                                addressLine1: addressLine,
                                city,
                                subdivision,
                                postalCode
                            }
                        }
                    },
                    cost: {
                        price: {
                            amount: String(shippingCost),
                            formattedAmount: `$${shippingCost.toFixed(2)}`
                        }
                    }
                },
                priceSummary: {
                    subtotal: {
                        amount: String(subtotalAmount),
                        formattedAmount: cart.subtotal?.formattedAmount || `$${subtotalAmount.toFixed(2)}`
                    },
                    shipping: {
                        amount: String(shippingCost),
                        formattedAmount: `$${shippingCost.toFixed(2)}`
                    },
                    total: {
                        amount: String(grandTotal),
                        formattedAmount: `$${grandTotal.toFixed(2)}`
                    }
                },
                lineItems: cart.lineItems.map(item => ({
                    catalogReference: item.catalogReference,
                    productName: item.productName,
                    quantity: item.quantity,
                    price: item.price,
                    lineItemPrice: item.lineItemPrice,
                    fullPrice: item.fullPrice || item.price,
                    priceBeforeDiscounts: item.priceBeforeDiscounts || item.price,
                    totalPriceBeforeTax: item.totalPriceBeforeTax || item.lineItemPrice,
                    totalPriceAfterTax: item.totalPriceAfterTax || item.lineItemPrice,
                    taxDetails: item.taxDetails || {
                        totalTax: { amount: "0" },
                        taxRate: "0"
                    },
                    itemType: { preset: "PHYSICAL" },
                    physicalProperties: item.physicalProperties || {
                        weight: 0,
                        sku: item.sku || ""
                    },
                    media: item.media
                }))
            };

            // Create order
            const createdOrder = await createMyOrder(order, { includeChannelInfo: true });
            console.log("Order created successfully:", createdOrder._id);

            // Start payment process
            const paymentResult = await wixPay.startPayment(paymentResponse.paymentId, {
                showThankYouPage: true
            });

            if (paymentResult.status === "Successful") {
                // Update order payment status
                await updateMyOrderPaymentStatus({
                    orderId: createdOrder._id,
                    paymentId: paymentResponse.paymentId,
                    status: "APPROVED"
                });
                console.log("Payment successful!");
            } else {
                console.warn("Payment canceled/failed:", paymentResult.status);
                $w('#errorMessage2').text = "Payment was not completed. Please try again.";
                $w('#errorMessage2').expand();
            }

        } catch (err) {
            console.error("Payment/Order Error:", err);
            await logErrorToDB("paymentButton", err);

            // Show user-friendly error
            $w('#errorMessage2').text = err.message || "Payment failed. Please try again or contact support.";
            $w('#errorMessage2').expand();
        }
    });
});

// ===== LOAD CART AND BIND TO ORDER SUMMARY =====
async function loadCartAndBind() {
    try {
        const cart = await myGetCurrentCartFunction();
        console.log("Current Cart:", cart);

        if (!cart || !cart.lineItems || cart.lineItems.length === 0) {
            $w('#orderSummary').collapse();
            console.log("Cart is empty");
            return;
        }

        console.log(`Cart has ${cart.lineItems.length} items - expanding orderSummary`);

        // Expand order summary
        try {
            const orderSummaryElement = $w('#orderSummary');
            orderSummaryElement.expand();
            console.log("orderSummary expanded");
        } catch (e) {
            console.error("ERROR expanding orderSummary:", e);
        }

        items = cart.lineItems;

        // ===== GET CHECKOUT DATA FOR ACCURATE SHIPPING AND TAX =====
        if (cart.checkoutId) {
            try {
                currentCheckout = await myGetCheckoutFunction(cart.checkoutId);
                console.log("✓ Checkout data loaded");

                // Extract shipping from checkout (if not manually overridden via radio)
                if (currentCheckout?.priceSummary?.shipping?.amount) {
                    const checkoutShipping = parseFloat(currentCheckout.priceSummary.shipping.amount);
                    if (checkoutShipping > 0 && shippingCost === 0) {
                        shippingCost = checkoutShipping;
                        console.log("→ Using shipping from checkout:", shippingCost);
                    }
                }
            } catch (err) {
                console.warn("Could not fetch checkout data:", err);
                currentCheckout = null;
            }
        }

        // CALCULATE TAX OURSELVES (10% GST)
        // We calculate this on the displayed subtotal + shipping to ensure consistency
        const cartSubtotal = parseFloat(cart.subtotal?.amount || 0);
        const taxableAmount = cartSubtotal + shippingCost;
        taxAmount = taxableAmount * 0.10;

        console.log("=== TAX CALCULATION ===");
        console.log("Subtotal:", cartSubtotal);
        console.log("Shipping:", shippingCost);
        console.log("Taxable Amount:", taxableAmount);
        console.log("Calculated GST (10%):", taxAmount);

        // Update order summary display
        await updateOrderSummaryDisplay();

        const repeaterData = items.map(item => {
            return {
                _id: item._id,
                productImage: item.media || item.image || "",
                productName: item.productName?.original || "Unknown Item",
                productQty: `Qty: ${item.quantity || 1}`,
                productPrice: item.price?.formattedConvertedAmount || item.price?.formattedAmount || "$0.00"
            };
        });

        console.log("Repeater data prepared:", repeaterData);

        $w('#productRepeater').data = repeaterData;
        $w('#productRepeater').onItemReady(($item, itemData) => {
            $item('#productImage').src = itemData.productImage;
            $item('#productName').text = itemData.productName;
            $item('#productQty').text = itemData.productQty;
            $item('#productPrice').text = itemData.productPrice;
        });

    } catch (err) {
        console.error("Failed to load cart:", err);
        await logErrorToDB("loadCartAndBind", err);
        $w('#orderSummary').collapse();
    }
}

// ===== UPDATE ORDER SUMMARY DISPLAY (when shipping or other values change) =====
async function updateOrderSummaryDisplay() {
    try {
        const cart = await myGetCurrentCartFunction();
        if (!cart || !cart.lineItems || cart.lineItems.length === 0) {
            console.log("Cannot update order summary - cart is empty");
            return;
        }

        const currencySymbol = cart.subtotal?.formattedAmount?.match(/^[\D]+/)?.[0] || '$';
        const subtotalAmount = parseFloat(cart.subtotal?.amount || 0);

        // Recalculate Tax/GST based on current subtotal and shipping
        taxAmount = (subtotalAmount + shippingCost) * 0.10;

        const grandTotal = subtotalAmount + shippingCost + taxAmount;

        console.log("=== ORDER SUMMARY CALCULATION ===");
        console.log("Subtotal:", subtotalAmount);
        console.log("Shipping:", shippingCost);
        console.log("Tax/GST:", taxAmount);
        console.log("Grand Total:", grandTotal);
        console.log("Calculation:", `${subtotalAmount} + ${shippingCost} + ${taxAmount} = ${grandTotal}`);

        // Update all amounts in UI
        $w('#subTotal').text = `${currencySymbol}${subtotalAmount.toFixed(2)}`;
        $w('#deliveryAmount').text = `${currencySymbol}${shippingCost.toFixed(2)}`;

        // Show GST if element exists
        try {
            $w('#gstAmount').text = `${currencySymbol}${taxAmount.toFixed(2)}`;
            console.log("GST displayed:", `${currencySymbol}${taxAmount.toFixed(2)}`);
        } catch (e) {
            console.warn("GST element (#gstAmount) not found on page - GST will be included in total but not shown separately");
        }

        $w('#grandTotal').text = `${currencySymbol}${grandTotal.toFixed(2)}`;
        console.log("=== ORDER SUMMARY UPDATED ===");


    } catch (err) {
        console.error("Failed to update order summary:", err);
    }
}

// ===== ERROR LOGGING =====
async function logErrorToDB(location, error) {
    try {
        await wixData.insert("logs", {
            location,
            message: error.message || String(error),
            stack: error.stack,
            timestamp: new Date()
        });
    } catch (e) {
        console.error("Failed to log error", e);
    }
}