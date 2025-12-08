import { Permissions, webMethod } from 'wix-web-module';
import { fetch } from 'wix-fetch';
import wixData from 'wix-data';
import { getSecret } from 'wix-secrets-backend';

/**
 * Get PayPal Access Token
 */
async function getAccessToken() {
    try {
        const clientId = await getSecret("clientId");
        const clientSecret = await getSecret("clientSecret");

        const auth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');

        const response = await fetch('https://api-m.paypal.com/v1/oauth2/token', {
            method: 'POST',
            headers: {
                'Authorization': `Basic ${auth}`,
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            body: 'grant_type=client_credentials'
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Failed to get access token: ${errorText}`);
        }

        const data = await response.json();
        return data.access_token;
    } catch (error) {
        console.error("Failed to retrieve PayPal access token:", error);
        throw error;
    }
}

/**
 * Get PayPal checkout URL
 */
export const getPayPalCheckout = webMethod(
    Permissions.Anyone,
    async (
        items,
        wixTransactionId,
        shippingName,
        shippingPhone,
        shippingAddress,
        buyerEmail,
        currency,
        successUrl,
        cancelUrl,
        shippingCost,
        paypalFee  // PayPal transaction fee (2.9% + $0.30)
    ) => {
        try {
            // Validation
            if (!items || items.length === 0) {
                throw new Error("Items are required for PayPal checkout");
            }

            if (!buyerEmail) {
                throw new Error("Buyer email is required");
            }

            if (!successUrl || !cancelUrl) {
                throw new Error("Return URLs are required");
            }

            console.log("Creating PayPal checkout for:", {
                wixTransactionId,
                buyerEmail,
                currency: currency || 'AUD',
                itemCount: items.length,
                paypalFee: paypalFee || 0
            });

            // Calculate totals first (all in dollars)
            const itemsTotal = items.reduce((sum, item) => sum + (parseFloat(item.price) || 0) * (item.quantity || 1), 0);
            const shippingTotal = parseFloat(shippingCost) || 0;
            const paypalFeeTotal = parseFloat(paypalFee) || 0;
            const grandTotal = (itemsTotal + shippingTotal + paypalFeeTotal).toFixed(2);

            // Format items for PayPal (prices are already in dollars)
            // Distribute PayPal fee proportionally across items as tax
            const paypalItems = items.map(item => {
                const itemPrice = parseFloat(item.price) || 0;
                const qty = item.quantity || 1;
                // Calculate this item's share of the PayPal fee (proportional to its value)
                const itemTax = itemsTotal > 0
                    ? Number(((itemPrice * qty / itemsTotal) * paypalFeeTotal / qty).toFixed(2))
                    : 0;

                return {
                    name: item.name || "Product",
                    unit_amount: {
                        currency_code: currency || 'AUD',
                        value: itemPrice.toFixed(2)
                    },
                    tax: {
                        currency_code: currency || 'AUD',
                        value: itemTax.toFixed(2)
                    },
                    quantity: String(qty),
                    category: "PHYSICAL_GOODS"
                };
            });

            // PayPal order creation payload
            const orderPayload = {
                intent: "CAPTURE",
                purchase_units: [
                    {
                        reference_id: wixTransactionId || `WIX_${Date.now()}`,
                        amount: {
                            currency_code: currency || 'AUD',
                            value: grandTotal,
                            breakdown: {
                                item_total: {
                                    currency_code: currency || 'AUD',
                                    value: itemsTotal.toFixed(2)
                                },
                                shipping: {
                                    currency_code: currency || 'AUD',
                                    value: shippingTotal.toFixed(2)
                                },
                                tax_total: {
                                    currency_code: currency || 'AUD',
                                    value: paypalFeeTotal.toFixed(2)
                                }
                            }
                        },
                        items: paypalItems,
                        // Only include shipping if we have a valid address (city is required by PayPal)
                        ...(shippingAddress?.city ? {
                            shipping: {
                                name: {
                                    full_name: shippingName || "Customer"
                                },
                                address: {
                                    address_line_1: shippingAddress?.line1 || "",
                                    address_line_2: shippingAddress?.line2 || "",
                                    admin_area_2: shippingAddress?.city || "",
                                    admin_area_1: shippingAddress?.state || "",
                                    postal_code: shippingAddress?.postal_code || "",
                                    country_code: shippingAddress?.country || "AU"
                                }
                            }
                        } : {})
                    }
                ],
                application_context: {
                    return_url: successUrl,
                    cancel_url: cancelUrl,
                    brand_name: "Candella Fabrica",
                    user_action: "PAY_NOW"
                }
            };

            console.log("✅ PayPal order payload prepared:", JSON.stringify(orderPayload, null, 2));

            // Get Access Token
            const accessToken = await getAccessToken();

            // Create Order
            const response = await fetch('https://api-m.paypal.com/v2/checkout/orders', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${accessToken}`
                },
                body: JSON.stringify(orderPayload)
            });

            if (!response.ok) {
                const errorText = await response.text();
                // If it's a JSON response, parse it for better logging
                try {
                    const errorJson = JSON.parse(errorText);
                    console.error("❌ PayPal API Error Details:", JSON.stringify(errorJson, null, 2));
                    throw new Error(`PayPal API Error: ${errorJson.message || errorText}`);
                } catch (e) {
                    throw new Error(`PayPal API request failed: ${errorText}`);
                }
            }

            const orderData = await response.json();
            console.log("✅ PayPal Order Created:", orderData.id);

            // Find approval URL
            const approveLink = orderData.links.find(link => link.rel === 'approve');

            if (!approveLink) {
                throw new Error("No approval link found in PayPal response");
            }

            return {
                url: approveLink.href
            };

        } catch (error) {
            console.error("❌ PayPal checkout error:", error);
            await logErrorToDB("getPayPalCheckout", error);
            throw new Error(`PayPal checkout failed: ${error.message}`);
        }
    }
);

/**
 * Log any error to a collection named logs
 */
async function logErrorToDB(location, error) {
    try {
        await wixData.insert("logs", {
            location,
            message: error?.message || String(error),
            stack: error?.stack || null,
            timestamp: new Date()
        });
    } catch (loggingError) {
        console.error("⚠️ Failed to log error to DB:", loggingError);
    }
}