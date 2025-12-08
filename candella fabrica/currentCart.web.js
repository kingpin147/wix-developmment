import { Permissions, webMethod } from "wix-web-module";
import { currentCart } from "wix-ecom-backend";
import { checkout } from "wix-ecom-backend";
import wixData from 'wix-data';

/**
 * Create checkout from current cart
 */
export const myCreateCheckoutFromCurrentCartFunction = webMethod(
    Permissions.Anyone,
    async (checkoutId) => {
        try {
            if (!checkoutId) {
                throw new Error("Checkout ID is required");
            }

            console.log("Success! Checkout created, checkoutId:", checkoutId);
            return checkoutId;
        } catch (error) {
            console.error("❌ Error in myCreateCheckoutFromCurrentCartFunction:", error);
            await logErrorToDB("myCreateCheckoutFromCurrentCartFunction", error);
            throw new Error(`Failed to create checkout: ${error.message}`);
        }
    },
);

/**
 * Update checkout with customer info and shipping address
 */
export const updateCheckoutWithShipping = webMethod(Permissions.Anyone, async (data) => {
    const { checkoutId, shippingInfo, contactInfo } = data;

    try {
        console.log("Updating checkout with shipping info:", { checkoutId, shippingInfo });

        // Update the checkout with buyer contact and shipping address
        const updatedCheckout = await checkout.updateCheckout(checkoutId, {
            buyerInfo: {
                email: contactInfo.email,
                identityType: "CONTACT"
            },
            shippingInfo: {
                shippingDestination: {
                    contactDetails: {
                        firstName: contactInfo.firstName,
                        lastName: contactInfo.lastName,
                        phone: contactInfo.phone,
                        email: contactInfo.email,
                        company: contactInfo.company || ""
                    },
                    address: {
                        country: shippingInfo.country,
                        subdivision: shippingInfo.subdivision,
                        city: shippingInfo.city,
                        postalCode: shippingInfo.postalCode,
                        addressLine1: shippingInfo.addressLine1,
                        addressLine2: shippingInfo.addressLine2 || ""
                    }
                }
            }
        });

        console.log("✅ Checkout updated with shipping address");

        return { success: true, checkoutId: updatedCheckout._id };

    } catch (error) {
        console.error("❌ Failed to update checkout:", error);
        await logErrorToDB("updateCheckoutWithShipping", error);
        throw new Error(`Failed to update checkout: ${error.message}`);
    }
});


/**
 * Get current cart
 */
export const myGetCurrentCartFunction = webMethod(
    Permissions.Anyone,
    async () => {
        try {
            const myCurrentCart = await currentCart.getCurrentCart();

            if (!myCurrentCart) {
                throw new Error("Failed to retrieve current cart");
            }

            console.log("Success! Retrieved current cart:", myCurrentCart);
            return myCurrentCart;
        } catch (error) {
            console.error("❌ Error in myGetCurrentCartFunction:", error);
            await logErrorToDB("myGetCurrentCartFunction", error);
            throw new Error(`Failed to get current cart: ${error.message}`);
        }
    },
);

/**
 * Get checkout by ID
 */
export const myGetCheckoutFunction = webMethod(
    Permissions.Anyone,
    async (checkoutId) => {
        try {
            if (!checkoutId) {
                throw new Error("Checkout ID is required");
            }

            const retrievedCheckout = await checkout.getCheckout(checkoutId);

            if (!retrievedCheckout) {
                throw new Error(`Checkout not found for ID: ${checkoutId}`);
            }

            console.log("Success! Retrieved checkout:", retrievedCheckout);
            return retrievedCheckout;
        } catch (error) {
            console.error("❌ Error in myGetCheckoutFunction:", error);
            await logErrorToDB("myGetCheckoutFunction", error);
            throw new Error(`Failed to get checkout: ${error.message}`);
        }
    },
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