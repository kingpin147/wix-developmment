# Candella Fabrica - Custom Checkout Integration

This project implements a custom checkout flow for Candella Fabrica on the Wix platform. It provides a streamlined, one-step checkout experience by integrating cart management, address validation, and payment processing into a single interface.

## 🚀 Overview

The custom checkout solution replaces the standard Wix checkout flow to provide:
- **Streamlined User Experience**: Merged address validation and payment into a single interaction.
- **Shipping Bypass**: Automatically uses shipping methods selected on the cart page, skipping redundant selection steps.
- **Custom GST Calculation**: Real-time calculation and display of 10% GST on the subtotal and shipping.
- **Integrated Payment Gateway**: Seamless integration with Wix Pay.

## 📂 Project Structure

### Frontend
- **[checkOut.js](file:///e:/desktop2/wix%20developmment/candella%20fabrica/checkOut.js)**: The main frontend logic for the checkout page. Handles form validation, order summary updates, and coordinates the payment process.

### Backend (Web Methods)
- **[currentCart.web.js](file:///e:/desktop2/wix%20developmment/candella%20fabrica/currentCart.web.js)**: Manages cart and checkout data retrieval using `wix-ecom-backend`.
- **[order.web.js](file:///e:/desktop2/wix%20developmment/candella%20fabrica/order.web.js)**: Handles order creation and payment status updates with elevated permissions.
- **[wixPay.web.js](file:///e:/desktop2/wix%20developmment/candella%20fabrica/wixPay.web.js)**: Manages the creation of payment objects via `wix-pay-backend`.
- **[paypal.web.js](file:///e:/desktop2/wix%20developmment/candella%20fabrica/paypal.web.js)**: (If applicable) Logic for PayPal-specific payment flows.

## 🛠️ Key Features

### 1. Smart Shipping Integration
The checkout automatically pulls the shipping method and cost from the current Wix checkout session. Users don't need to re-select shipping if they've already done so on the cart page.

### 2. Consolidated Validation
All customer details (Name, Email, Phone) and delivery information (Address, City, Postcode) are validated in a single step when the user clicks the "Pay Now" button.

### 3. Dynamic Order Summary
The order summary updates in real-time to show:
- Subtotal
- Shipping Cost (automatically retrieved)
- GST (10% of Subtotal + Shipping)
- Grand Total

### 4. Error Logging
System errors are automatically logged to a `logs` collection in Wix Data for easier debugging and monitoring.

## 🔧 Installation & Setup

1. **Wix Collections**: Ensure a `logs` collection exists in your Wix CMS with fields for `location`, `message`, `stack`, and `timestamp`.
2. **Backend Files**: Upload the `.web.js` files to your Wix backend folder.
3. **Frontend Page**: Add the `checkOut.js` code to your custom checkout page and ensure all element IDs matches (e.g., `#paymentButton`, `#email`, `#addressInput`, etc.).

## 🔐 Security
Order creation and payment status updates are handled via elevated backend functions to ensure secure transaction management.

---
*Developed for Candella Fabrica.*
