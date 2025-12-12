import { createOpenAIResponse } from "backend/openAi"
import wixData from 'wix-data';
import wixWindowFrontend from "wix-window-frontend";

// IMPORTANT: Replace the placeholder IDs below with the actual IDs of your elements.
const DROPDOWN_PRODUCT_TYPE_ID = "#dropdownProductType";
const DROPDOWN_GENRE_ID = "#dropdownGenre";
const DROPDOWN_TONE_ID = "#dropdownTone";
const DROPDOWN_TARGET_AUDIENCE_ID = "#dropdownTargetAudience";
const GENERATE_BUTTON_ID = "#generate"; // Assuming the button ID is #generate
const ERROR_TEXT_ID = "#errorText1"; // ID for the status/error text element
let dbTemplate = "";
    let dbInstruction = "";

$w.onReady(async function () {
    // Collapse sections and error text on initial load
    $w("#reportSection").collapse();
    $w(ERROR_TEXT_ID).collapse(); // Collapse error text on load

    // --- Dropdown Population Logic (omitted for brevity, assume it's correct) ---
    // ... (Your dropdown population code) ...
    await wixData.query("AdminControl").distinct("productType").then(results => {
        if (results.items.length > 0) $w(DROPDOWN_PRODUCT_TYPE_ID).options = results.items.map(item => ({ label: item, value: item }));
    }).catch(error => console.error("Error loading Product Types:", error));

    await wixData.query("AdminControl").distinct("genre").then(results => {
        if (results.items.length > 0) $w(DROPDOWN_GENRE_ID).options = results.items.map(item => ({ label: item, value: item }));
    }).catch(error => console.error("Error loading Genres:", error));

    await wixData.query("AdminControl").distinct("tone").then(results => {
        if (results.items.length > 0) $w(DROPDOWN_TONE_ID).options = results.items.map(item => ({ label: item, value: item }));
    }).catch(error => console.error("Error loading Tones:", error));

    await wixData.query("AdminControl").distinct("targetAudience").then(results => {
        if (results.items.length > 0) $w(DROPDOWN_TARGET_AUDIENCE_ID).options = results.items.map(item => ({ label: item, value: item }));
    }).catch(error => console.error("Error loading Target Audiences:", error));
    await wixData.query("AdminControl").distinct("purposeGoal").then(results => {
        if (results.items.length > 0) $w("#purpose").options = results.items.map(item => ({ label: item, value: item }));
    }).catch(error => console.error("Error loading Target Audiences:", error));
    await wixData.query("AdminControl").distinct("wordCount").then(results => {
        if (results.items.length > 0) $w("#wordCount").options = results.items.map(item => ({ label: item, value: item }));
    }).catch(error => console.error("Error loading Target Audiences:", error));
    // --- End of dropdown population logic ---

    // Set up click handler
    $w(GENERATE_BUTTON_ID).onClick(onGenerateButtonClick);
});

/**
 * Handles the click event of the Generate button.
 */
async function onGenerateButtonClick() {
    // 1. Get selected values from dropdowns and user input
    const productType = $w(DROPDOWN_PRODUCT_TYPE_ID).value;
    const genre = $w(DROPDOWN_GENRE_ID).value;
    const tone = $w(DROPDOWN_TONE_ID).value;
    const targetAudience = $w(DROPDOWN_TARGET_AUDIENCE_ID).value;
    const purposeGoal = $w("#purpose").value;
    const wordCount = $w("#wordCount").value;
    const keywords = $w("#keywordsTextArea").value || "";
    const notes = $w("#keywordsTextArea").value || "";

    // Collapse any previous error/status message
    $w(ERROR_TEXT_ID).collapse();

    // Basic validation
    if (!productType || !genre || !tone || !targetAudience || !purposeGoal || !wordCount) {
        console.log("Please select a value for all dropdowns.");
        $w(ERROR_TEXT_ID).text = "🛑 Please select a value for all dropdowns.";
        $w(ERROR_TEXT_ID).expand();
        return;
    }

    // --- Show Status: "Generating Report" ---
    $w(ERROR_TEXT_ID).text = "🤖 Generating report... Please wait.";
    $w(ERROR_TEXT_ID).expand();
    $w(GENERATE_BUTTON_ID).disable(); // Disable button while processing

    // 2. Query the AdminControl collection for the instruction
    try {
        let query = wixData.query("AdminControl"); 
        let results = await query.find();

        const correctItem = results.items.find(item => 
    item.promptTemplateName && item.instruction
);

// Check if an item meeting the criteria was found
if (correctItem) {
    // If found, safely assign the values from that item
    dbTemplate = correctItem.promptTemplateName;
    dbInstruction = correctItem.instruction;
    
    console.log(`Template found at random index: ${dbTemplate}`);
    console.log(`Instruction found at random index: ${dbInstruction}`);

} else {
    // If no item meets the criteria (or array is empty)
    dbTemplate = "";
    dbInstruction = "";
    
    console.log("No suitable item (with both template and instruction) was found.");
}

        // 3. Construct the final prompt
        const finalPrompt = `${dbTemplate} \n\n ${dbInstruction}\n\n User Request: Product Type: ${productType}\n\n genre: ${genre}\n\n tone: ${tone}\n\n targetAudience: ${targetAudience}\n\n Purpose Goal: ${purposeGoal}\n\n Word Count: ${wordCount}\n\n Keywords: ${keywords}\n\n Notes: ${notes}\n\n`;

        // 4. Call OpenAI
        await sendToOpenAI(finalPrompt);

    } catch (error) {
        console.error("Error during generation process:", error);
        $w(ERROR_TEXT_ID).text = "⚠️ An error occurred while fetching instructions from the database.";
        $w(ERROR_TEXT_ID).expand(); // Keep error visible
        $w(GENERATE_BUTTON_ID).enable(); // Re-enable button
    }
}

/**
 * Sends the final prompt to the OpenAI backend function and handles UI updates.
 * @param {string} prompt The combined instruction and user request.
 */
async function sendToOpenAI(prompt) {
    try {
        // 5. Call the backend function
        const aiResponse = await createOpenAIResponse(prompt);

        $w("#reportOutput").text = aiResponse;
        $w("#reportSection").expand();
        $w("#formSection").collapse();
        
        // --- Action 1: Collapse status text after success ---
        $w(ERROR_TEXT_ID).collapse(); 
        
    } catch (error) {
        console.error("Failed to get response from OpenAI:", error);
        $w(ERROR_TEXT_ID).text = "❌ Failed to generate report. Please check the backend service.";
        $w(ERROR_TEXT_ID).expand(); // Show error
    } finally {
        $w(GENERATE_BUTTON_ID).enable(); // Re-enable button regardless of success/fail
    }
}

$w('#generateAgain').onClick((event) => {
    $w("#reportSection").collapse();
    $w("#formSection").expand();
    $w("#reportOutput").text = " ";
    
    // --- Action 2: Collapse error text when trying again ---
    $w(ERROR_TEXT_ID).collapse(); 
    $w('#errorText2').collapse();
})

$w('#copy').onClick(async (event) => {
    // Collapse any old error text before trying to copy
    $w('#errorText2').collapse(); 
    
    const ReportText = $w('#reportOutput').text;
    await wixWindowFrontend
        .copyToClipboard(ReportText)
        .then(() => {
            $w('#errorText2').text = "✅ Report Successfully Copied";
            $w('#errorText2').expand();
        })
        .catch((err) => {
            $w('#errorText2').text = "❌ Report copy failed... try again";
            $w('#errorText2').expand();
        });
})