import wixLocationFrontend from "wix-location-frontend";
import { local } from 'wix-storage-frontend';

import { createOpenAIResponse } from "backend/openAi"
import wixData from 'wix-data';
import wixWindowFrontend from "wix-window-frontend";
import { currentMember, authentication } from "wix-members-frontend";
import { orders } from "wix-pricing-plans-frontend";
import { generatePDF } from "backend/pdfGenerator";

// Global variables
let dbTemplate = "";
let dbInstruction = "";
let fileUrl = "";
let fileName = "";

// Product-Ready Rules based on requirements
const PRODUCT_RULES = {
    "Lead Magnet – Downloadable": {
        mustInclude: ["Catchy Title", "Executive Summary", "Checklist/Action Plan", "Key Resource Steps", "Call-to-Action"],
        mustNotBe: ["Blog post", "Simple article", "Unstructured notes"],
        defaultAssumption: "A multi-page PDF resource that provides immediate value and is ready for download.",
        structuralRequirement: "Use clear section headers (# for Title, ## for Sections). Incorporate checklists and bullet points. Focus on 'Download-Ready' structure."
    },
    "Lead Magnet": {
        mustInclude: ["Clear Title", "Brief Welcome/Introduction", "Actionable Framework (checklist, steps, tips, or short guide)", "Reflection or Action Section", "Clear Call-to-Action (CTA)"],
        mustNotBe: ["Blog post", "Generic informational article", "Academic explanation"],
        defaultAssumption: "1-3 pages, high-value downloadable resource.",
        structuralRequirement: "Use bullet points and bold headers for scanability."
    },
    "Checklist / Cheat Sheet": {
        mustInclude: ["Goal-Driven Title", "Pre-flight Requirements", "Numbered Step-by-Step Task List", "Success Metric", "Quick Tip Section"],
        mustNotBe: ["Paragraph heavy content", "Theoretical explanation"],
        defaultAssumption: "A one-page reference tool for quick execution.",
        structuralRequirement: "Highly concise. Use checklist format. Minimal fluff."
    },
    "Lesson Plan": {
        mustInclude: ["Lesson Title", "Target Audience/Level", "Learning Objectives", "Materials Needed", "Step-by-Step Instruction Guide", "Activities & Exercises", "Assessment/Outcomes"],
        mustNotBe: ["Devotional", "Motivational article", "General advice list"],
        defaultAssumption: "Instructor-ready teaching guide for immediate classroom use.",
        structuralRequirement: "Formal educational structure with timed sections if possible."
    },
    "Workbook / Worksheet": {
        mustInclude: ["Engaging Title", "Guided Instructions", "Self-Reflection Questions", "Fill-in-the-blank or Exercise Sections", "Actionable Exercises"],
        mustNotBe: ["Essay-style content", "Narrative-only material"],
        defaultAssumption: "Interactive digital product designed for user participation.",
        structuralRequirement: "Consistent use of 'Your Turn' or 'Reflect Here' boxes."
    },
    "Course Outline": {
        mustInclude: ["Course Title", "High-level Course Summary", "Module Breakdown", "Individual Lesson Titles per Module", "Specific Learning Outcomes per Lesson", "Recommended Resources"],
        mustNotBe: ["Full transcripts", "Short summary"],
        defaultAssumption: "Comprehensive structural map for a multi-week training program.",
        structuralRequirement: "Logical progression from beginner to advanced concepts."
    },
    "Page Section / Copy": {
        mustInclude: ["Sub-headline", "Body Text", "Key Highlight/Benefit", "Transition to next section"],
        mustNotBe: ["Full book", "Intro-only content"],
        defaultAssumption: "A high-impact section intended for a larger webpage or document.",
        structuralRequirement: "Focus on readability and conversion. Use concise paragraphs and bold highlights."
    },
    "Book": {
        mustInclude: ["Catchy Title", "Table of Contents", "Introduction", "Thematic Chapters", "Conclusion", "About the Author"],
        mustNotBe: ["Short article", "Single page guide"],
        defaultAssumption: "A comprehensive long-form manuscript or structured guide.",
        structuralRequirement: "Use hierarchy (# Title, ## Chapters). Focus on depth and narrative flow."
    }

};

const UNIVERSAL_CHECKLIST = [
    "Match the selected Product Type exactly",
    "Product-Ready: Be usable as-is (PDF, document, or digital download)",
    "Professional Formatting: Use Markdown (headings, bolding, lists)",
    "High Quality: Zero spelling or grammatical errors",
    "Actionable: Focus on transformation and results, not just info",
    "No Meta-Talk: Do not include 'Here is your product' or conversational filler",
    "Word Count Adherence: Meet or exceed the targeted word count with meaningful content"
];

function getRulesForProduct(type) {
    if (!type) return null;

    // Exact match
    if (PRODUCT_RULES[type]) return PRODUCT_RULES[type];

    // Partial matches
    if (type.includes("Lead Magnet")) return PRODUCT_RULES["Lead Magnet – Downloadable"];
    if (type.includes("Worksheet") || type.includes("Workbook")) return PRODUCT_RULES["Workbook / Worksheet"];
    if (type.includes("Checklist")) return PRODUCT_RULES["Checklist / Cheat Sheet"];
    if (type.includes("Lesson")) return PRODUCT_RULES["Lesson Plan"];
    if (type.includes("Outline")) return PRODUCT_RULES["Course Outline"];
    if (type.includes("Section") || type.includes("Copy")) return PRODUCT_RULES["Page Section / Copy"];

    return null;
}

let options = {
    fieldsets: ['FULL']
}
let MemberId = null;
let report = null;

$w.onReady(async function () {
    console.log('========================================');
    console.log('🚀 PAGE READY - Starting initialization');
    console.log('========================================');

    console.log('\n🎨 Setting up UI elements...');
    $w("#reportSection").collapse();
    $w("#errorText1").collapse();
    console.log('  ✅ Report section collapsed');
    console.log('  ✅ Error text collapsed');

    // Define all initialization tasks to run in parallel
    const initTasks = [
        checkMembership(),
        populateDropdowns(),
        loadInstructions()
    ];

    console.log('\n⚡ Starting parallel data loading...');
    await Promise.all(initTasks);

    // Set up click handler
    console.log('\n🔧 Setting up event handlers...');
    $w("#generate").onClick(onGenerateButtonClick);
    console.log('  ✅ Generate button click handler attached');

    // Restoration Logic
    restoreReportState();

    console.log('\n========================================');

    console.log('✅ INITIALIZATION COMPLETE');
    console.log('========================================');
    console.log('Summary:');
    console.log('  - Elements: Ready');
    console.log('  - Dropdowns: Populated');
    console.log('  - DB Template:', dbTemplate ? 'Loaded (' + dbTemplate.length + ' chars)' : 'EMPTY');
    console.log('  - DB Instruction:', dbInstruction ? 'Loaded (' + dbInstruction.length + ' chars)' : 'EMPTY');
    console.log('  - Event handlers: Attached');
    console.log('========================================\n');
});

/**
 * Checks membership status in parallel
 */
async function checkMembership() {
    console.log('🔐 Checking authentication status...');
    if (authentication.loggedIn()) {
        try {
            console.log('  → Fetching member details...');
            const member = await currentMember.getMember(options);
            MemberId = member._id;
            console.log("  ✅ Member ID:", MemberId);

            console.log('📦 Checking membership status...');
            if (wixWindowFrontend.viewMode === 'Site') {
                const ordersList = await orders.listCurrentMemberOrders();
                const hasActiveMembership = ordersList.some(order => order.status === "ACTIVE");

                if (!hasActiveMembership) {
                    wixLocationFrontend.to("/pricing-plans");
                } else {
                    console.log("  ✅ Active membership confirmed.");
                }
            } else {
                console.log("  ⚠️ Preview mode: Skipping membership check.");
            }
        } catch (error) {
            console.error("  ❌ Error checking membership details:", error);
        }
    } else {
        authentication.promptLogin();
    }
}

/**
 * Populates all dropdowns in parallel
 */
async function populateDropdowns() {
    console.log('📊 Loading dropdown data from database...');

    const dropdownTasks = [
        populateDropdown("#dropdownProductType", "productType"),
        populateDropdown("#dropdownGenre", "genre"),
        populateDropdown("#dropdownTone", "tone"),
        populateDropdown("#dropdownTargetAudience", "targetAudience"),
        populateDropdown("#purpose", "purposeGoal"),
        populateWordCountDropdown()
    ];

    await Promise.all(dropdownTasks);
}

/**
 * Helper to populate a standard dropdown via distinct query
 */
async function populateDropdown(dropdownId, field) {
    console.log(`  → Loading ${field}...`);
    try {
        const results = await wixData.query("AdminControl").distinct(field);
        if (results.items.length > 0) {
            $w(dropdownId).options = results.items.map(item => ({ label: item, value: item }));
            console.log(`  ✅ ${field} dropdown populated`);
        }
    } catch (error) {
        console.error(`  ❌ Error loading ${field}:`, error);
    }
}

/**
 * Special handling for Word Count dropdown
 */
async function populateWordCountDropdown() {
    console.log(`  → Loading wordCount...`);
    try {
        const results = await wixData.query("AdminControl").distinct("wordCount");
        if (results.items.length > 0) {
            const filteredOptions = results.items
                .filter(item => !item.includes("Very Long"))
                .map(item => ({ label: item, value: item }));
            $w("#wordCount").options = filteredOptions;
            console.log('  ✅ Word Count dropdown populated');
        }
    } catch (error) {
        console.error("  ❌ Error loading Word Counts:", error);
    }
}

/**
 * Loads instructions and templates in parallel
 */
async function loadInstructions() {
    console.log('📚 Loading instructions and templates...');
    try {
        const results = await wixData.query("AdminControl").find();
        const correctItem = results.items.find(item => item.promptTemplateName && item.instruction);

        if (correctItem) {
            dbTemplate = correctItem.promptTemplateName;
            dbInstruction = correctItem.instruction;
            console.log('  ✅ Template and Instruction loaded successfully!');
        } else {
            console.log('  ⚠️ No suitable item found.');
        }
    } catch (error) {
        console.error("  ❌ Error loading instructions:", error);
    }
}

/**
 * Handles the click event of the Generate button.
 */
async function onGenerateButtonClick() {
    // 1. Get selected values from dropdowns and user input
    const productType = $w("#dropdownProductType").value;
    const genre = $w("#dropdownGenre").value;
    const tone = $w("#dropdownTone").value;
    const targetAudience = $w("#dropdownTargetAudience").value;
    const purposeGoal = $w("#purpose").value;
    const wordCount = $w("#wordCount").value;

    // Parse keywords from text area: split by comma or whitespace, ignore empty, join with comma
    const rawKeywords = $w("#keywordsTextArea").value || "";
    const keywords = rawKeywords.split(/[\s,]+/).filter(k => k).join(", ");

    // Capture notes from the dedicated text area
    const notes = $w("#notesTextArea").value || "";

    // Collapse any previous error/status message
    $w("#errorText1").collapse();

    // Basic validation
    if (!productType || !genre || !tone || !targetAudience || !purposeGoal || !wordCount) {
        console.log("Please select a value for all dropdowns.");
        $w("#errorText1").text = "🛑 Please select a value for all dropdowns.";
        $w("#errorText1").expand();
        return;
    }

    // Status: "Generating Report"
    $w("#errorText1").text = "🤖 Generating report... Please wait.";
    $w("#errorText1").expand();
    $w("#generate").disable();


    // 2. Query the AdminControl collection for the instruction
    try {

        // 3. Combine template and instruction for the API
        const instructions = `productTemplate = ${dbTemplate} - productInstruction = ${dbInstruction} , `;

        // 4. Construct the product-specific rules part of the prompt
        const rules = getRulesForProduct(productType);
        let rulesPrompt = "";

        if (rules) {
            rulesPrompt = `
### ${productType.toUpperCase()} STRUCTURE:
- MUST INCLUDE: ${rules.mustInclude.join(", ")}
- MUST NOT BE: ${rules.mustNotBe.join(", ")}
- ASSUMPTION: ${rules.defaultAssumption}
- FORMATTING: ${rules.structuralRequirement}
            `;
        } else {
            // Default rules if type is novel
            rulesPrompt = `
### ${productType.toUpperCase()} STRUCTURE:
- FORMATTING: Use professional headers and structured bullet points.
- GOAL: Provide a high-value, actionable ${productType}.
            `;
        }

        // 5. Construct the final prompt with explicit instructions for file-ready output
        const finalPrompt = `
YOU ARE CREATING A PROFESSIONALLY FORMATTED ${productType.toUpperCase()}.

${rulesPrompt}

### CRITERIA:
${UNIVERSAL_CHECKLIST.map(item => `- ${item}`).join("\n")}

### PARAMETERS:
- Product Type: ${productType}
- Subject/Topic: ${genre}
- Professional Tone: ${tone}
- Ideal Audience: ${targetAudience}
- Ultimate Goal: ${purposeGoal}
- Targeted Depth: ${wordCount} words
- Keywords to include: ${keywords}
- Additional Context/Notes: ${notes}

### FORMATTING INSTRUCTIONS FOR PDF GENERATION:
1. USE MARKDOWN: Use # for the main title, ## for major sections, and ### for subsections.
2. LISTS: Use bullet points (- ) or numbered lists (1. ) for checklists and action steps.
3. NO CHAT: Start immediately with the product content. No conversational filler like "Sure, here is your product."
4. STRUCTURE: Organize the content to be visually clean and logical for a PDF document.
5. DEPTH: Ensure the content matches the requested word count of ${wordCount}.

START GENERATING THE ${productType.toUpperCase()} NOW:
`;

        // 5. Call OpenAI with both prompt and instructions
        await sendToOpenAI(finalPrompt, instructions);

    } catch (error) {
        console.error("Error during generation process:", error);
        $w("#errorText1").text = "⚠️ An error occurred while fetching instructions from the database.";
        $w("#errorText1").expand(); // Keep error visible
        $w("#generate").enable(); // Re-enable button
    }
}

/**
 * Sends the final prompt to the OpenAI backend function and handles UI updates.
 * @param {string} prompt The combined user request.
 * @param {string} instructions The combined system instructions.
 */
async function sendToOpenAI(prompt, instructions) {
    try {
        // 5. Call the backend function
        report = await createOpenAIResponse(prompt, instructions);
        $w("#reportOutput").text = report;
        $w("#reportSection").expand();
        $w("#formSection").collapse();

        // --- Action 1: Collapse status text after success ---
        $w("#errorText1").collapse();

        // --- NEW: Automatically Prepare PDF ---
        $w('#errorText2').text = "✨ Content generated! Preparing your downloadable file...";
        $w('#errorText2').expand();

        try {
            const response = await generatePDF(report);
            if (response.success) {
                fileUrl = response.fileUrl;
                fileName = response.fileName;
                $w('#errorText2').text = "✅ Your product and download file are ready!";

                // Persistence
                saveReportState();
            } else {
                console.error("PDF preparation failed:", response.error);
                $w('#errorText2').text = "⚠️ Content ready, but PDF preparation failed. You can still copy the text.";
            }
        } catch (pdfErr) {
            console.error("PDF preparation error:", pdfErr);
            $w('#errorText2').text = "⚠️ Note: PDF could not be pre-generated. Click download to try again.";
        }


    } catch (error) {
        console.error("Failed to get response from OpenAI:", error);
        $w("#errorText1").text = "❌ Oops! Maybe try a lesser word count? ✍️";
        $w("#errorText1").expand(); // Show error
    } finally {
        $w("#generate").enable(); // Re-enable button regardless of success/fail
    }
}

$w('#generateAgain').onClick((event) => {
    $w("#reportSection").collapse();
    $w("#formSection").expand();
    $w("#reportOutput").text = " ";

    // Clear persistence
    local.removeItem("lastReport");
    local.removeItem("lastFileUrl");
    local.removeItem("lastFileName");

    // --- Action 2: Collapse error text when trying again ---
    $w("#errorText1").collapse();
    $w('#errorText2').collapse();
})


$w('#copy').onClick(async (event) => {
    $w('#errorText2').collapse();
    const originalLabel = $w('#copy').label;
    const ReportText = $w('#reportOutput').text;

    await wixWindowFrontend
        .copyToClipboard(ReportText)
        .then(() => {
            $w('#copy').label = "Copied! ✅";
            setTimeout(() => { $w('#copy').label = originalLabel; }, 2000);
            $w('#errorText2').text = "✅ Content copied to clipboard";
            $w('#errorText2').expand();
        })
        .catch((err) => {
            $w('#errorText2').text = "❌ Copy failed. Please try again.";
            $w('#errorText2').expand();
        });
})


$w('#saveReport').onClick(async (event) => {
    $w('#saveReport').disable();
    $w('#errorText2').text = "💾 Saving to your dashboard...";
    $w('#errorText2').expand();

    let toInsert = {
        memberId: MemberId,
        report: report,
        fileUrl: fileUrl,
        fileName: fileName,
        generatedDate: new Date()
    }
    await wixData
        .insert("SavedReports", toInsert)
        .then((item) => {
            console.log("Saved item:", item);
            $w('#errorText2').text = "✅ Product Successfully Saved to your Dashboard!";
            $w('#errorText2').expand();
            // We keep the text visible so they can still read/copy/download it.
            // But we change the button to show it's done.
            $w('#saveReport').label = "Saved!";
        })
        .catch((err) => {
            console.error("Save error:", err);
            $w('#errorText2').text = "❌ Report save failed... try again";
            $w('#errorText2').expand();
            $w('#saveReport').enable();
        });
});

$w('#downloadProduct').onClick(async (event) => {
    console.log('=== DOWNLOAD BUTTON CLICKED ===');

    if (!report) {
        $w('#errorText2').text = "⚠️ No content available to download.";
        $w('#errorText2').expand();
        return;
    }

    // If we already have a fileUrl (pre-generated), use it!
    if (fileUrl) {
        console.log('Using pre-generated fileUrl:', fileUrl);
        $w('#errorText2').text = "✅ Downloading your file...";
        wixLocationFrontend.to(fileUrl);
        return;
    }

    $w('#errorText2').text = "⏳ Generating PDF... Please wait.";
    $w('#errorText2').expand();

    try {
        const response = await generatePDF(report);
        if (!response.success) throw new Error(response.error);

        fileUrl = response.fileUrl;
        fileName = response.fileName;

        $w('#errorText2').text = "✅ PDF Generated! Downloading...";
        wixLocationFrontend.to(response.downloadUrl || response.fileUrl);

    } catch (error) {
        console.error('Download error:', error);
        $w('#errorText2').text = "❌ PDF Generation failed: " + (error.message || "Try again.");
        $w('#errorText2').expand();
    }
});

// Persistence Helpers
function saveReportState() {
    if (report) {
        local.setItem("lastReport", report);
        if (fileUrl) local.setItem("lastFileUrl", fileUrl);
        if (fileName) local.setItem("lastFileName", fileName);
        console.log("💾 Report state saved to local storage.");
    }
}

function restoreReportState() {
    const savedReport = local.getItem("lastReport");
    if (savedReport) {
        console.log("🔄 Restoring saved report state...");
        report = savedReport;
        fileUrl = local.getItem("lastFileUrl");
        fileName = local.getItem("lastFileName");

        $w("#reportOutput").text = report;
        $w("#reportSection").expand();
        $w("#formSection").collapse();

        if (fileUrl) {
            $w('#errorText2').text = "✅ Your previous product is ready for download.";
            $w('#errorText2').expand();
        }

    }
}
