
import { getStripeCheckout } from "backend/stripe.web";
import wixData from 'wix-data';

// Helper function to log to the CMS 'logs' collection
async function logToCMS(functionName, logType, message, details = {}) {
    try {
        const logEntry = {
            timestamp: new Date(),
            functionName,
            logType,
            message,
            details: JSON.parse(JSON.stringify(details)), // Ensure JSON-serializable
        };
        await wixData.insert('logs', logEntry);
        console.log(`Logged to CMS: ${functionName} - ${logType} - ${message}`);
    } catch (error) {
        console.error('Failed to log to CMS:', error);
    }
}

export const connectAccount = async (options, context) => {
    // Log function entry
    await logToCMS('connectAccount', 'INFO', 'Received connectAccount request', { options });

    const { credentials } = options;

    try {
        // Validate credentials
        if (!credentials?.stripeApiKey) { // <-- Changed from secretApiKey to stripeApiKey
            const errorMsg = 'Invalid or missing credentials';
            await logToCMS('connectAccount', 'ERROR', errorMsg, { credentials });
            return {
                error: {
                    message: errorMsg,
                    code: 'INVALID_CREDENTIALS',
                },
            };
        }

        // Log success
        await logToCMS('connectAccount', 'SUCCESS', 'Successfully connected account', { credentials });
        return {
            credentials,
        };
    } catch (error) {
        // Log error
        await logToCMS('connectAccount', 'ERROR', 'Failed to connect account', {
            error: error.message,
            stack: error.stack,
            credentials,
        });
        return {
            error: {
                message: 'Failed to connect account',
                code: 'CONNECT_ACCOUNT_FAILED',
            },
        };
    }
};

export const createTransaction = async (options, context) => {
    // Log function entry
    await logToCMS('createTransaction', 'INFO', 'Received createTransaction request', { options });

    const { merchantCredentials, order, wixTransactionId } = options;
    const apiKey = merchantCredentials?.stripeApiKey;
    const lineItems = order?.description?.items;
    const shipping = order?.description?.shippingAddress;
    const buyerEmail = shipping?.email;
    const shippingName = `${shipping?.firstName} ${shipping?.lastName}`;
    const shippingPhone = shipping?.phone;
    const shippingAddress = {
        line1: shipping?.address,
        city: shipping?.city,
        state: shipping?.state,
        postal_code: shipping?.zipCode,
        country: shipping?.countryCode
    };
    const currency = order?.description?.currency?.toLowerCase(); // Fixed: Access currency from description
    const successUrl = order?.returnUrls?.successUrl;
    const cancelUrl = order?.returnUrls?.cancelUrl;
    const shippingCost = order?.description?.charges?.shipping;

    try {
        // Validate inputs
        if (!apiKey) {
            const errorMsg = 'Missing Stripe API key';
            await logToCMS('createTransaction', 'ERROR', errorMsg, { merchantCredentials });
            throw new Error(errorMsg);
        }
        if (!Array.isArray(lineItems) || lineItems.length === 0) {
            const errorMsg = 'Invalid or empty lineItems';
            await logToCMS('createTransaction', 'ERROR', errorMsg, { order });
            throw new Error(errorMsg);
        }
        if (!wixTransactionId) {
            const errorMsg = 'Missing wixTransactionId';
            await logToCMS('createTransaction', 'ERROR', errorMsg, { wixTransactionId });
            throw new Error(errorMsg);
        }
        if (!shipping || !buyerEmail || !shippingName || !shippingAddress.country) {
            const errorMsg = 'Missing or invalid shipping address details';
            await logToCMS('createTransaction', 'ERROR', errorMsg, { shipping });
            throw new Error(errorMsg);
        }
        if (!currency ) {
            const errorMsg = 'Missing or unsupported currency';
            await logToCMS('createTransaction', 'ERROR', errorMsg, { currency });
            throw new Error(errorMsg);
        }
        if (!successUrl || !cancelUrl) {
            const errorMsg = 'Missing return URLs';
            await logToCMS('createTransaction', 'ERROR', errorMsg, { returnUrls: order?.returnUrls });
            throw new Error(errorMsg);
        }

        // Pass shipping cost to getStripeCheckout
        const stripeCheckout = await getStripeCheckout(
            apiKey,
            lineItems,
            wixTransactionId,
            shippingName,
            shippingPhone,
            shippingAddress,
            buyerEmail,
            currency,
            successUrl,
            cancelUrl,
            shippingCost // <-- **FIX: Added shippingCost here**
        );

        // Log success
        await logToCMS('createTransaction', 'SUCCESS', 'Created Stripe checkout session', {
            pluginTransactionId: stripeCheckout.id,
            redirectUrl: stripeCheckout.url,
            wixTransactionId,
        });

        return {
            pluginTransactionId: stripeCheckout.id,
            redirectUrl: stripeCheckout.url,
        };
    } catch (error) {
        // Log error
        await logToCMS('createTransaction', 'ERROR', 'Failed to create Stripe checkout session', {
            error: error.message,
            stack: error.stack,
            wixTransactionId,
            merchantCredentials,
            order,
            currency,
            shippingName,
            shippingAddress,
            buyerEmail,
        });

        return {
            error: {
                message: 'Failed to create Stripe checkout session',
                code: 'STRIPE_CHECKOUT_FAILED',
            },
        };
    }
};

export const refundTransaction = async (options, context) => {

};