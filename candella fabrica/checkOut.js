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
    if (!countryNameOrCode) return "AU";

    // Handle Wix Address object
    if (typeof countryNameOrCode === 'object') {
        return (countryNameOrCode.code || countryNameOrCode.value || "AU").toUpperCase();
    }

    // If already 2-letter code, return as-is
    if (countryNameOrCode.length === 2) {
        return countryNameOrCode.toUpperCase();
    }

    // Otherwise look up in mapping
    return COUNTRY_CODE_MAP[countryNameOrCode] || "AU";
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


    $w('#errorMessage1').collapse();
    $w('#paymentButton').enable();

    // Load cart data into orderSummary
    await loadCartAndBind();

    // Listen for cart changes
    wixEcomFrontend.onCartChange(async () => {
        console.log("Cart changed — refreshing...");
        await loadCartAndBind();
    });

    // ===== PAYMENT BUTTON - Process payment =====
    $w('#paymentButton').onClick(async () => {
        console.log("Payment button clicked");

        // Hide previous errors
        $w('#errorMessage1').collapse();

        // --- VALIDATE DETAILS ---
        const email = $w('#email').value?.trim();
        const firstName = $w('#firstName').value?.trim();
        const lastName = $w('#lastName').value?.trim();
        const phone = $w('#phoneNumber').value?.trim();
        const Businessname = $w('#businessName').value?.trim();

        const addressObj = $w('#addressInput').value;

        if (!email || !firstName || !lastName || !phone || !addressObj || !addressObj.city || !addressObj.subdivision || !addressObj.postalCode || !addressObj.country) {
            $w('#errorMessage1').text = "Please enter a complete address using the address search.";
            $w('#errorMessage1').expand();
            return;
        }

        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            $w('#errorMessage1').text = "Please enter a valid email address.";
            $w('#errorMessage1').expand();
            return;
        }

        // Helper utilities
        const toPriceString = (val) => Number(Number(val) || 0).toFixed(2);
        const safeString = (val) => {
            if (val === null || val === undefined) return "";
            if (typeof val === 'object') {
                return val.value || val.label || val.formatted || val.addressLine1 || JSON.stringify(val);
            }
            return String(val);
        };

        // Store shipping info from the address object
        country = getCountryCode(addressObj.country);
        city = safeString(addressObj.city);
        subdivision = typeof addressObj.subdivision === 'object' ? (addressObj.subdivision.code || addressObj.subdivision.name) : addressObj.subdivision;
        postalCode = safeString(addressObj.postalCode);
        addressLine = safeString(addressObj.formatted);

        try {
            // Get latest cart
            const cart = await myGetCurrentCartFunction();
            if (!cart || !cart.lineItems || cart.lineItems.length === 0) {
                throw new Error("Your cart is empty. Please add items before checkout.");
            }

            console.log("DEBUG: Raw Cart Line Items:", JSON.stringify(cart.lineItems, null, 2));

            // Calculate totals including GST (round to 2 decimals)
            const subtotalAmount = parseFloat(cart.subtotal?.amount || 0);
            const currentTaxableAmount = subtotalAmount + shippingCost;
            const currentTaxAmount = Number((currentTaxableAmount * 0.10).toFixed(2));
            const currentGrandTotal = Number((subtotalAmount + shippingCost + currentTaxAmount).toFixed(2));

            if (currentGrandTotal <= 0) {
                throw new Error("Total amount must be greater than zero.");
            }

            // 1. Prepare payment items for wix-pay
            const paymentItems = cart.lineItems.map(item => ({
                name: (item.productName?.original || "Item").substring(0, 100),
                price: Number(parseFloat(item.lineItemPrice?.amount || 0).toFixed(2))
            }));

            if (shippingCost > 0) {
                paymentItems.push({ name: "Shipping", price: Number(shippingCost.toFixed(2)) });
            }
            if (currentTaxAmount > 0) {
                paymentItems.push({ name: "GST (10%)", price: Number(currentTaxAmount.toFixed(2)) });
            }

            // 2. Create payment in Wix Pay
            const paymentResponse = await createMyPayment({
                items: paymentItems,
                totalPrice: Number(currentGrandTotal.toFixed(2))
            });

            console.log("Payment created:", paymentResponse);

            // 3. Build Order Object for Ecom API
            if (!country || country.length !== 2) {
                throw new Error(`Invalid country code: ${country}. Must be 2-letter ISO code.`);
            }

            const WIX_STORES_APP_ID = "215238eb-22a5-4c36-9e7b-e7c08025e04e";

            const orderToCreate = {
                channelInfo: { type: "WEB" },
                currency: cart.currency || "AUD",
                buyerInfo: {
                    email: safeString(email),
                    phone: safeString(phone)
                },
                billingInfo: {
                    contactDetails: {
                        firstName: safeString(firstName),
                        lastName: safeString(lastName),
                        email: safeString(email),
                        phone: safeString(phone),
                        company: safeString(Businessname)
                    },
                    address: {
                        country: safeString(country || "AU"),
                        addressLine1: safeString(addressLine),
                        city: safeString(city),
                        subdivision: safeString(subdivision),
                        postalCode: safeString(postalCode)
                    }
                },
                recipientInfo: {
                    contactDetails: {
                        firstName: safeString(firstName),
                        lastName: safeString(lastName),
                        email: safeString(email),
                        phone: safeString(phone),
                        company: safeString(Businessname)
                    },
                    address: {
                        country: safeString(country || "AU"),
                        addressLine1: safeString(addressLine),
                        city: safeString(city),
                        subdivision: safeString(subdivision),
                        postalCode: safeString(postalCode)
                    }
                },
                shippingInfo: {
                    logistics: {
                        shippingDestination: {
                            address: {
                                country: safeString(country || "AU"),
                                addressLine1: safeString(addressLine),
                                city: safeString(city),
                                subdivision: safeString(subdivision),
                                postalCode: safeString(postalCode)
                            }
                        }
                    },
                    cost: {
                        price: {
                            amount: toPriceString(shippingCost)
                        }
                    }
                },
                priceSummary: {
                    subtotal: {
                        amount: toPriceString(subtotalAmount)
                    },
                    shipping: {
                        amount: toPriceString(shippingCost)
                    },
                    tax: {
                        amount: toPriceString(currentTaxAmount)
                    },
                    total: {
                        amount: toPriceString(currentGrandTotal)
                    }
                },
                lineItems: cart.lineItems.map(item => {
                    // Flatten options and variantId for the dashboard
                    const rawOptions = item.catalogReference?.options || {};
                    const flattenedOptions = {
                        ...(rawOptions.options || {}),
                        variantId: rawOptions.variantId || ""
                    };

                    const lineItem = {
                        catalogReference: {
                            catalogItemId: safeString(item.catalogReference?.catalogItemId),
                            appId: safeString(item.catalogReference?.appId || WIX_STORES_APP_ID),
                            options: flattenedOptions
                        },
                        productName: {
                            original: safeString(item.productName?.original || "Item").substring(0, 100),
                            translated: safeString(item.productName?.translated || item.productName?.original || "Item").substring(0, 100)
                        },
                        quantity: Number(item.quantity) || 1,
                        price: {
                            amount: toPriceString(item.price?.amount)
                        },
                        lineItemPrice: {
                            amount: toPriceString(item.lineItemPrice?.amount)
                        },
                        taxDetails: {
                            taxRate: "0",
                            totalTax: {
                                amount: "0.00"
                            }
                        },
                        itemType: { preset: "PHYSICAL" },
                        physicalProperties: {
                            sku: safeString(item.physicalProperties?.sku || item.sku),
                            weight: Number(item.physicalProperties?.weight || 0)
                        }
                    };

                    return lineItem;
                })
            };

            console.log("Creating Order with payload:", JSON.stringify(orderToCreate, null, 2));

            // 4. Create Order
            const createdOrder = await createMyOrder(orderToCreate, { includeChannelInfo: true });
            const orderId = createdOrder?._id || createdOrder?.id;

            if (!orderId) {
                console.error("Order created but no ID returned:", createdOrder);
                throw new Error("Order was not finalized correctly. Please contact support.");
            }
            console.log("Order created successfully. Order ID:", orderId);

            // 5. Start Payment process UI
            const paymentResult = await wixPay.startPayment(paymentResponse.paymentId, {
                showThankYouPage: true
            });

            if (paymentResult.status === "Successful") {
                await updateMyOrderPaymentStatus({
                    orderId: orderId,
                    paymentId: paymentResponse.paymentId,
                    status: "APPROVED"
                });
                console.log("Payment successful and order status updated.");
            } else {
                console.warn("Payment canceled/failed:", paymentResult.status);
                $w('#errorMessage1').text = "Payment was not completed. Your order has been placed but is pending payment.";
                $w('#errorMessage1').expand();
            }

        } catch (err) {
            const errorMsg = err.message || (typeof err === 'string' ? err : JSON.stringify(err));
            console.error("Detailed Payment/Order Error:", errorMsg);
            await logErrorToDB("paymentButton", err);
            $w('#errorMessage1').text = "Checkout Failed: " + (err.description || err.message || "An unexpected error occurred.");
            $w('#errorMessage1').expand();
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
        // We calculate this on the displayed subtotal + shipping and round to 2 decimals
        const cartSubtotal = parseFloat(cart.subtotal?.amount || 0);
        const taxableAmount = cartSubtotal + shippingCost;
        taxAmount = Number((taxableAmount * 0.10).toFixed(2));

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

        // Recalculate Tax/GST based on current subtotal and shipping, rounding to 2 decimals
        taxAmount = Number(((subtotalAmount + shippingCost) * 0.10).toFixed(2));

        const grandTotal = Number((subtotalAmount + shippingCost + taxAmount).toFixed(2));

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