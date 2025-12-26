import wixData from 'wix-data';
import { currentMember, authentication } from "wix-members-frontend";
import wixLocationFrontend from "wix-location-frontend";


$w.onReady(async function () {
    let memberId = null;

    // Check if member is logged in
    if (authentication.loggedIn()) {
        try {
            const member = await currentMember.getMember({ fieldsets: ['FULL'] });
            memberId = member._id;
            console.log("Member ID:", memberId);
        } catch (error) {
            console.error("Error fetching member details:", error);
        }
    } else {
        console.log("Member is not logged in. Prompting login...");
        await authentication.promptLogin();
        // After login, get member again
        try {
            const member = await currentMember.getMember({ fieldsets: ['FULL'] });
            memberId = member._id;
            console.log("Member ID after login:", memberId);
        } catch (error) {
            console.error("Error after login:", error);
            return;
        }
    }

    // Only proceed if we have a valid memberId
    if (!memberId) {
        console.log("No member ID available.");
        $w("#reportRepeater").data = [{ _id: "no-reports", report: "No reports currently available" }];
        return;
    }

    try {
        const results = await wixData.query("SavedReports")
            .eq("memberId", memberId)
            .find();

        let reportItems;

        if (results.items.length === 0) {
            // No reports found — show placeholder item
            reportItems = [{ _id: "no-reports", report: "No reports currently available" }];
        } else {
            // Use actual reports
            reportItems = results.items;
        }

        // Assign data to repeater
        $w("#reportRepeater").data = reportItems;

        // Configure how each item is displayed
        $w("#reportRepeater").onItemReady(($item, itemData) => {
            if (itemData._id === "no-reports") {
                $item("#reportText").text = itemData.report;
                // Hide download button for placeholder
                if ($item("#pdfDownload")) $item("#pdfDownload").collapse();
            } else {
                // Clean up markdown hashes for display
                const cleanText = (itemData.report || "").replace(/^#+\s/gm, '');
                $item("#reportText").text = cleanText;

                // Handle PDF Download Button
                if ($item("#pdfDownload")) {
                    $item("#pdfDownload").expand();
                    $item("#pdfDownload").onClick(() => {
                        if (itemData.fileUrl) {
                            console.log("Downloading existing PDF:", itemData.fileUrl);
                            wixLocationFrontend.to(itemData.fileUrl);
                        } else {
                            console.warn("No fileUrl found for report:", itemData._id);
                            // Optional: Alert user or attempt regeneration
                        }
                    });
                }
            }
        });


    } catch (error) {
        console.error("Error querying SavedReports:", error);
        $w("#reportRepeater").data = [{ _id: "error", report: "Error loading reports." }];
        $w("#reportRepeater").onItemReady(($item, itemData) => {
            $item("#reportText").text = itemData.report;
        });
    }
});