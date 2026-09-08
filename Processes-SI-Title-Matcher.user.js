// ==UserScript==
// @name         Processes SI Title Matcher
// @namespace    Processes-SI-Title-Matcher
// @version      4.7
// @author       Jiali Tang
// @icon         https://pub.mdpi-res.com/img/journals/processes-logo-sq.png?1e142e5ab0d148f8
// @description  Match scholars with Processes Special Issues and generate literature search queries
// @match        *://*/*
// @homepageURL  https://github.com/scarlett-personaluse/scopus-mdpi-helper
// @grant        GM_xmlhttpRequest
// @grant        GM_setClipboard
// @grant        GM_registerMenuCommand
// @grant        GM_getValue
// @grant        GM_setValue
// @connect      api.deepseek.com
// @connect      gist.githubusercontent.com
// ==/UserScript==

(function () {
    "use strict";

    // =========================================================
    // Basic settings
    // =========================================================

    const MODEL = "deepseek-chat";

    const API_KEY_STORAGE = "processes_deepseek_api_key";
    const API_KEY_TIME_STORAGE = "processes_deepseek_api_key_time";
    const API_KEY_VALID_MS = 7 * 24 * 60 * 60 * 1000;

    const SI_LIST_URL =
        "https://gist.githubusercontent.com/scarlett-personaluse/53c0316fb23a0fd021e753f5192a4e5f/raw/SI%20list-scarlett";

    const STORAGE_KEY = "processes_existing_si_titles_cache";
    const CACHE_TIME_KEY = "processes_existing_si_titles_cache_time";
    const SI_HASH_KEY = "processes_existing_si_titles_hash";

    const UI_IDS = {
        MINI_BUTTON: "processes-si-mini-button",
        PANEL: "processes-si-panel",
        DRAG_HANDLE: "processes-si-drag-handle",
        MINIMIZE: "processes-si-minimize",
        OUTPUT: "processes-si-output",
        STATUS: "processes-si-status",
        CLEANER_INPUT: "processes-si-cleaner-input"
    };

    // =========================================================
    // Startup
    // =========================================================

    registerMenuCommands();
    initializeUI();

    function registerMenuCommands() {
        GM_registerMenuCommand(
            "Set / Reset DeepSeek API Key",
            setApiKey
        );

        GM_registerMenuCommand(
            "Refresh Processes SI List",
            refreshSIList
        );

        GM_registerMenuCommand(
            "Check Processes SI List Updates",
            checkSIListUpdates
        );
    }

    function initializeUI() {
        if (document.readyState === "loading") {
            document.addEventListener(
                "DOMContentLoaded",
                createUI,
                { once: true }
            );
        } else {
            createUI();
        }
    }

    // =========================================================
    // API key
    // =========================================================

    function setApiKey() {
        const newKey = prompt(
            "Please enter your DeepSeek API Key:"
        );

        if (!newKey || !newKey.trim()) {
            return;
        }

        GM_setValue(
            API_KEY_STORAGE,
            newKey.trim()
        );

        GM_setValue(
            API_KEY_TIME_STORAGE,
            String(Date.now())
        );

        alert(
            "DeepSeek API Key saved for 7 days in this browser."
        );
    }

    function getApiKey() {
        let apiKey =
            GM_getValue(API_KEY_STORAGE, "");

        const apiKeyTime =
            Number(
                GM_getValue(
                    API_KEY_TIME_STORAGE,
                    "0"
                )
            );

        const now = Date.now();

        if (
            apiKey &&
            apiKeyTime &&
            now - apiKeyTime < API_KEY_VALID_MS
        ) {
            return apiKey.trim();
        }

        if (
            apiKey &&
            apiKeyTime &&
            now - apiKeyTime >= API_KEY_VALID_MS
        ) {
            GM_setValue(
                API_KEY_STORAGE,
                ""
            );

            GM_setValue(
                API_KEY_TIME_STORAGE,
                "0"
            );
        }

        apiKey = prompt(
            "Please enter your DeepSeek API Key:"
        );

        if (!apiKey || !apiKey.trim()) {
            alert(
                "DeepSeek API Key is required to use this function."
            );

            return null;
        }

        GM_setValue(
            API_KEY_STORAGE,
            apiKey.trim()
        );

        GM_setValue(
            API_KEY_TIME_STORAGE,
            String(Date.now())
        );

        return apiKey.trim();
    }

    // =========================================================
    // User interface
    // =========================================================

    function createUI() {
        if (
            document.getElementById(
                UI_IDS.MINI_BUTTON
            ) ||
            document.getElementById(
                UI_IDS.PANEL
            )
        ) {
            return;
        }

        if (!document.body) {
            setTimeout(createUI, 300);
            return;
        }

        injectStyles();

        const miniButton =
            document.createElement("button");

        miniButton.id = UI_IDS.MINI_BUTTON;
        miniButton.textContent = "SI Title";
        miniButton.type = "button";

        Object.assign(
            miniButton.style,
            {
                position: "fixed",
                right: "18px",
                bottom: "8px",
                zIndex: "2147483647",
                padding: "10px 14px",
                border: "none",
                borderRadius: "20px",
                background: "#1677ff",
                color: "#ffffff",
                cursor: "move",
                fontSize: "13px",
                fontWeight: "600",
                fontFamily:
                    "Arial, sans-serif",
                boxShadow:
                    "0 3px 12px rgba(0,0,0,0.25)"
            }
        );

        const panel =
            document.createElement("div");

        panel.id = UI_IDS.PANEL;

        Object.assign(
            panel.style,
            {
                position: "fixed",
                right: "18px",
                bottom: "8px",
                width: "400px",
                maxHeight: "88vh",
                zIndex: "2147483647",
                background: "#ffffff",
                border: "1px solid #cccccc",
                borderRadius: "12px",
                boxShadow:
                    "0 4px 16px rgba(0,0,0,0.18)",
                fontFamily:
                    "Arial, sans-serif",
                overflow: "hidden",
                display: "none"
            }
        );

        panel.innerHTML = `
            <div id="${UI_IDS.DRAG_HANDLE}" class="processes-si-header">
                <span>Processes SI Matcher</span>

                <button
                    id="${UI_IDS.MINIMIZE}"
                    type="button"
                    class="processes-si-minimize"
                >
                    −
                </button>
            </div>

            <div class="processes-si-body">
                <button
                    id="processes-si-match-button"
                    type="button"
                    class="processes-si-button"
                >
                    Match / Generate SI
                </button>

                <button
                    id="processes-si-query-button"
                    type="button"
                    class="processes-si-button"
                >
                    Generate Scilit Query + Keywords
                </button>

                <button
                    id="processes-si-refresh-button"
                    type="button"
                    class="processes-si-button"
                >
                    Refresh SI List
                </button>

                <button
                    id="processes-si-check-button"
                    type="button"
                    class="processes-si-button"
                >
                    Check SI List Updates
                </button>

                <button
                    id="processes-si-copy-button"
                    type="button"
                    class="processes-si-button"
                >
                    Copy Result
                </button>

                <button
                    id="processes-si-api-button"
                    type="button"
                    class="processes-si-button"
                >
                    Set / Reset API Key
                </button>

                <div id="${UI_IDS.STATUS}" class="processes-si-status">
                    SI list: checking...
                </div>

                <textarea
                    id="${UI_IDS.OUTPUT}"
                    class="processes-si-output"
                    placeholder="The generated result will appear here..."
                ></textarea>

                <div class="processes-si-cleaner-section">
                    <div class="processes-si-cleaner-title">
                        Text Cleaner: remove line breaks
                    </div>

                    <textarea
                        id="${UI_IDS.CLEANER_INPUT}"
                        class="processes-si-cleaner-input"
                        placeholder="Paste text here, then click Convert + Copy..."
                    ></textarea>

                    <div class="processes-si-cleaner-buttons">
                        <button
                            id="processes-si-convert-button"
                            type="button"
                            class="processes-si-small-button"
                        >
                            Convert + Copy
                        </button>

                        <button
                            id="processes-si-clear-button"
                            type="button"
                            class="processes-si-small-button"
                        >
                            Clear
                        </button>
                    </div>
                </div>
            </div>
        `;

        document.body.appendChild(miniButton);
        document.body.appendChild(panel);

        bindUIEvents(
            miniButton,
            panel
        );

        makeDraggable(
            miniButton,
            miniButton
        );

        makeDraggable(
            panel,
            document.getElementById(
                UI_IDS.DRAG_HANDLE
            )
        );

        updateStatus();
    }

    function injectStyles() {
        if (
            document.getElementById(
                "processes-si-style"
            )
        ) {
            return;
        }

        const style =
            document.createElement("style");

        style.id = "processes-si-style";

        style.textContent = `
            .processes-si-header {
                background: #1677ff;
                color: #ffffff;
                padding: 10px 12px;
                font-weight: 700;
                display: flex;
                justify-content: space-between;
                align-items: center;
                cursor: move;
            }

            .processes-si-minimize {
                border: none;
                background: #ffffff;
                color: #1677ff;
                border-radius: 6px;
                cursor: pointer;
                font-weight: 700;
                min-width: 28px;
                height: 24px;
            }

            .processes-si-body {
                padding: 12px;
                max-height: calc(88vh - 44px);
                overflow-y: auto;
            }

            .processes-si-button {
                width: 100%;
                margin: 4px 0;
                padding: 8px;
                border: none;
                border-radius: 8px;
                background: #f0f5ff;
                color: #003a8c;
                cursor: pointer;
                font-size: 13px;
                text-align: left;
            }

            .processes-si-button:hover {
                background: #d6e4ff;
            }

            .processes-si-button:disabled {
                opacity: 0.6;
                cursor: not-allowed;
            }

            .processes-si-status {
                margin: 8px 0;
                font-size: 12px;
                color: #666666;
                overflow-wrap: anywhere;
            }

            .processes-si-output {
                width: 100%;
                height: 300px;
                border: 1px solid #cccccc;
                border-radius: 8px;
                padding: 8px;
                font-size: 12px;
                resize: vertical;
                box-sizing: border-box;
            }

            .processes-si-cleaner-section {
                margin-top: 12px;
                padding-top: 10px;
                border-top: 1px solid #eeeeee;
            }

            .processes-si-cleaner-title {
                font-size: 13px;
                font-weight: 700;
                color: #333333;
                margin-bottom: 6px;
            }

            .processes-si-cleaner-input {
                width: 100%;
                height: 95px;
                border: 1px solid #cccccc;
                border-radius: 8px;
                padding: 8px;
                font-size: 12px;
                resize: vertical;
                box-sizing: border-box;
            }

            .processes-si-cleaner-buttons {
                display: flex;
                gap: 6px;
                margin-top: 6px;
            }

            .processes-si-small-button {
                flex: 1;
                padding: 7px;
                border: none;
                border-radius: 8px;
                background: #f0f5ff;
                color: #003a8c;
                cursor: pointer;
                font-size: 12px;
            }

            .processes-si-small-button:hover {
                background: #d6e4ff;
            }
        `;

        (
            document.head ||
            document.documentElement
        ).appendChild(style);
    }

    function bindUIEvents(
        miniButton,
        panel
    ) {
        miniButton.addEventListener(
            "click",
            function () {
                if (
                    miniButton.dataset.dragged ===
                    "true"
                ) {
                    miniButton.dataset.dragged =
                        "false";

                    return;
                }

                miniButton.style.display =
                    "none";

                panel.style.display =
                    "block";

                keepElementInViewport(
                    panel
                );

                updateStatus();
            }
        );

        document
            .getElementById(
                UI_IDS.MINIMIZE
            )
            .addEventListener(
                "click",
                function () {
                    panel.style.display =
                        "none";

                    miniButton.style.display =
                        "block";

                    keepElementInViewport(
                        miniButton
                    );
                }
            );

        document
            .getElementById(
                "processes-si-match-button"
            )
            .addEventListener(
                "click",
                matchSI
            );

        document
            .getElementById(
                "processes-si-query-button"
            )
            .addEventListener(
                "click",
                generateSearchQueryAndKeywords
            );

        document
            .getElementById(
                "processes-si-refresh-button"
            )
            .addEventListener(
                "click",
                refreshSIList
            );

        document
            .getElementById(
                "processes-si-check-button"
            )
            .addEventListener(
                "click",
                checkSIListUpdates
            );

        document
            .getElementById(
                "processes-si-copy-button"
            )
            .addEventListener(
                "click",
                copyOutput
            );

        document
            .getElementById(
                "processes-si-api-button"
            )
            .addEventListener(
                "click",
                setApiKey
            );

        document
            .getElementById(
                "processes-si-convert-button"
            )
            .addEventListener(
                "click",
                convertCleanerText
            );

        document
            .getElementById(
                "processes-si-clear-button"
            )
            .addEventListener(
                "click",
                clearCleanerText
            );

        window.addEventListener(
            "resize",
            function () {
                keepElementInViewport(
                    miniButton
                );

                keepElementInViewport(
                    panel
                );
            }
        );
    }

    function makeDraggable(
        box,
        handle
    ) {
        if (!box || !handle) {
            return;
        }

        let isDragging = false;
        let moved = false;
        let offsetX = 0;
        let offsetY = 0;
        let startX = 0;
        let startY = 0;

        handle.addEventListener(
            "mousedown",
            function (event) {
                if (
                    handle !== box &&
                    event.target.closest("button")
                ) {
                    return;
                }

                isDragging = true;
                moved = false;

                startX = event.clientX;
                startY = event.clientY;

                const rect =
                    box.getBoundingClientRect();

                offsetX =
                    event.clientX - rect.left;

                offsetY =
                    event.clientY - rect.top;

                box.style.left =
                    rect.left + "px";

                box.style.top =
                    rect.top + "px";

                box.style.right = "auto";
                box.style.bottom = "auto";
                box.style.transform = "none";

                document.body.style.userSelect =
                    "none";

                event.preventDefault();
            }
        );

        document.addEventListener(
            "mousemove",
            function (event) {
                if (!isDragging) {
                    return;
                }

                if (
                    Math.abs(
                        event.clientX - startX
                    ) > 3 ||
                    Math.abs(
                        event.clientY - startY
                    ) > 3
                ) {
                    moved = true;
                    box.dataset.dragged =
                        "true";
                }

                const rect =
                    box.getBoundingClientRect();

                const maxLeft =
                    Math.max(
                        0,
                        window.innerWidth -
                        rect.width
                    );

                const maxTop =
                    Math.max(
                        0,
                        window.innerHeight -
                        rect.height
                    );

                let newLeft =
                    event.clientX -
                    offsetX;

                let newTop =
                    event.clientY -
                    offsetY;

                newLeft =
                    Math.max(
                        0,
                        Math.min(
                            newLeft,
                            maxLeft
                        )
                    );

                newTop =
                    Math.max(
                        0,
                        Math.min(
                            newTop,
                            maxTop
                        )
                    );

                box.style.left =
                    newLeft + "px";

                box.style.top =
                    newTop + "px";
            }
        );

        document.addEventListener(
            "mouseup",
            function () {
                if (!isDragging) {
                    return;
                }

                isDragging = false;
                document.body.style.userSelect =
                    "";

                if (!moved) {
                    box.dataset.dragged =
                        "false";
                } else {
                    setTimeout(
                        function () {
                            box.dataset.dragged =
                                "false";
                        },
                        180
                    );
                }
            }
        );
    }

    function keepElementInViewport(
        element
    ) {
        if (
            !element ||
            element.style.display === "none"
        ) {
            return;
        }

        const rect =
            element.getBoundingClientRect();

        let left = rect.left;
        let top = rect.top;

        if (rect.right > window.innerWidth) {
            left =
                Math.max(
                    0,
                    window.innerWidth -
                    rect.width
                );
        }

        if (
            rect.bottom >
            window.innerHeight
        ) {
            top =
                Math.max(
                    0,
                    window.innerHeight -
                    rect.height
                );
        }

        if (rect.left < 0) {
            left = 0;
        }

        if (rect.top < 0) {
            top = 0;
        }

        if (
            left !== rect.left ||
            top !== rect.top
        ) {
            element.style.left =
                left + "px";

            element.style.top =
                top + "px";

            element.style.right =
                "auto";

            element.style.bottom =
                "auto";
        }
    }

    // =========================================================
    // Status and output helpers
    // =========================================================

    function getOutputBox() {
        return document.getElementById(
            UI_IDS.OUTPUT
        );
    }

    function setOutput(text) {
        const outputBox =
            getOutputBox();

        if (outputBox) {
            outputBox.value =
                text || "";
        }
    }

    function updateStatus() {
        const status =
            document.getElementById(
                UI_IDS.STATUS
            );

        if (!status) {
            return;
        }

        const cached =
            GM_getValue(
                STORAGE_KEY,
                ""
            );

        const cacheTime =
            GM_getValue(
                CACHE_TIME_KEY,
                ""
            );

        if (!cached) {
            status.textContent =
                "SI list: not loaded. Click Refresh SI List once.";

            return;
        }

        const count =
            cached
                .split(/\r?\n+/)
                .map(
                    item => item.trim()
                )
                .filter(Boolean)
                .length;

        const time =
            cacheTime
                ? new Date(
                    Number(cacheTime)
                ).toLocaleString()
                : "unknown time";

        status.textContent =
            `SI list: ${count} titles cached, updated at ${time}`;
    }

    // =========================================================
    // SI list
    // =========================================================

    function refreshSIList() {
        setOutput(
            "Fetching SI list from Gist..."
        );

        fetchSIList(
            function (titles) {
                saveSIList(titles);

                setOutput(
                    "SI list updated successfully.\n\n" +
                    `Loaded ${titles.length} titles.`
                );

                updateStatus();
            },
            function (message) {
                setOutput(message);
            }
        );
    }

    function checkSIListUpdates() {
        setOutput(
            "Checking whether SI list has updates..."
        );

        fetchSIList(
            function (titles) {
                const cleanList =
                    [...new Set(titles)]
                        .join("\n");

                const newHash =
                    simpleHash(cleanList);

                const oldHash =
                    GM_getValue(
                        SI_HASH_KEY,
                        ""
                    );

                const oldList =
                    GM_getValue(
                        STORAGE_KEY,
                        ""
                    );

                if (!oldList) {
                    saveSIList(titles);

                    setOutput(
                        "No previous SI list cache found.\n\n" +
                        "SI list has now been loaded.\n" +
                        `Loaded ${titles.length} titles.`
                    );

                    updateStatus();

                    return;
                }

                if (newHash === oldHash) {
                    setOutput(
                        "No update detected. The cached SI list is still up to date."
                    );

                    updateStatus();

                    return;
                }

                saveSIList(titles);

                setOutput(
                    "SI list update detected and refreshed successfully.\n\n" +
                    `Loaded ${titles.length} titles.`
                );

                updateStatus();
            },
            function (message) {
                setOutput(message);
            }
        );
    }

    function fetchSIList(
        onSuccess,
        onFailure
    ) {
        GM_xmlhttpRequest({
            method: "GET",
            url: SI_LIST_URL,

            onload: function (response) {
                const text =
                    response.responseText ||
                    "";

                const titles =
                    extractSITitles(text);

                if (
                    !titles ||
                    titles.length < 5
                ) {
                    onFailure(
                        "Failed to extract SI titles from the Gist link.\n\n" +
                        "Please confirm that the raw Gist link is accessible and contains one SI title per line."
                    );

                    return;
                }

                onSuccess(titles);
            },

            onerror: function () {
                onFailure(
                    "Failed to fetch the SI list. Please check the network or Gist link."
                );
            },

            ontimeout: function () {
                onFailure(
                    "The SI list request timed out. Please try again."
                );
            }
        });
    }

    function saveSIList(titles) {
        const cleanList =
            [...new Set(titles)]
                .join("\n");

        GM_setValue(
            STORAGE_KEY,
            cleanList
        );

        GM_setValue(
            CACHE_TIME_KEY,
            String(Date.now())
        );

        GM_setValue(
            SI_HASH_KEY,
            simpleHash(cleanList)
        );
    }

    function extractSITitles(
        rawText
    ) {
        return String(rawText || "")
            .split(/\r?\n/)
            .map(
                item => item.trim()
            )
            .filter(
                item => item.length > 5
            )
            .filter(
                item =>
                    !/^SI Title$/i.test(
                        item
                    )
            );
    }

    function simpleHash(text) {
        let hash = 0;

        const value =
            String(text || "");

        for (
            let index = 0;
            index < value.length;
            index++
        ) {
            hash =
                (
                    (hash << 5) -
                    hash
                ) +
                value.charCodeAt(index);

            hash |= 0;
        }

        return String(hash);
    }

    // =========================================================
    // Scholar and SI matching
    // =========================================================

    function matchSI() {
        const selectedText =
            getSelectedText();

        if (!selectedText) {
            alert(
                "Please select scholar publications, research interests, funding information, or homepage text first."
            );

            return;
        }

        const existingSI =
            GM_getValue(
                STORAGE_KEY,
                ""
            );

        if (!existingSI) {
            alert(
                "Please click Refresh SI List once before first use."
            );

            return;
        }

        const apiKey =
            getApiKey();

        if (!apiKey) {
            return;
        }

        setOutput(
            "Analyzing scholar fields and matching Special Issues..."
        );

        const systemPrompt = `
You are a senior Section Managing Editor of the MDPI journal Processes.

Your task is to evaluate a scholar's representative publications or research information, determine the scholar's broad first-level academic field, judge whether the scholar fits Processes, and recommend the most relevant existing Special Issues.

Keep the analysis concise and practical.

CORE RULES

1. Do not combine all publications using strict AND logic.
2. Do not require one Special Issue to cover every publication, method, material, and application.
3. Determine one broad first-level academic field.
4. Identify the research direction shared by at least half of the selected publications.
5. Use this majority direction as the main basis for matching.
6. Treat specific materials, methods, algorithms, and applications as supporting information.
7. Recommend only Special Issues that reasonably cover the scholar's main and stable research direction.

PROCESSES SCOPE

Processes is an engineering- and process-oriented journal.

Relevant areas include:

- Chemical and Process Engineering
- Process Systems Engineering
- Fluid Mechanics and Transport Phenomena
- Heat and Mass Transfer
- Energy Processes and Systems
- Environmental Processes
- Industrial and Manufacturing Processes
- Materials Processing
- Separation and Purification Processes
- Food Process Engineering
- Biochemical and Bioprocess Engineering
- Pharmaceutical Processes
- Process Modeling and Simulation
- Process Optimization and Control
- Automation and Intelligent Manufacturing
- AI Applications in Engineering Processes
- Safety, Risk and Reliability
- Sustainable Industrial Processes
- Supply Chain and Logistics Processes
- CFD and Multiphase Flow

Materials, biological, environmental, energy, and AI studies need a clear process, engineering, modeling, optimization, control, manufacturing, or industrial application connection.

Usually unsuitable areas include:

- Pure clinical or medical research
- Pure agriculture
- Pure ecology
- Pure geology
- Pure theoretical physics
- Pure mathematics
- Basic materials characterization without process or engineering relevance
- General AI algorithm development without engineering process context

FIRST-LEVEL FIELD

Use a broad academic field, for example:

- Fluid Mechanics and Transport Phenomena
- Chemical and Process Engineering
- Process Systems Engineering
- Mechanical and Manufacturing Engineering
- Materials Processing and Manufacturing
- Thermal Engineering
- Energy Engineering
- Environmental Engineering
- Food Process Engineering
- Biochemical Engineering
- Separation Engineering
- Industrial Engineering
- Safety and Risk Engineering
- Supply Chain and Logistics Engineering

Do not use an individual method, material, algorithm, or research object as the first-level field.

MAJORITY DIRECTION

Identify the research direction shared by at least half of the selected publications.

Closely related topics may be summarized at a higher conceptual level.

CFD, ANN, DNN, RSM, optimization, numerical simulation, and similar tools should normally support the main direction rather than replace it.

EXISTING SPECIAL ISSUE MATCHING

Recommend 3–4 existing Special Issues with the highest meaningful relevance.

Do not recommend irrelevant titles merely to reach four.

Match primarily according to:

1. First-level academic field;
2. Majority research direction;
3. Core process or engineering problem;
4. Application scenario;
5. Modeling, simulation, optimization, control, or experimental methods.

Do not rely only on literal keyword overlap.

MATCHING SCORES

85%–100%:
The first-level field is highly consistent and the Special Issue directly covers the majority direction.

80%–84%:
The first-level field is consistent and the majority direction is substantially covered, with only minor differences.

65%–79%:
The field is related, but there are noticeable differences in research object, application, or process type.

50%–64%:
Only some methods, mechanisms, or publications are relevant.

Below 50%:
Only superficial words or broad concepts overlap.

NEW SPECIAL ISSUE GENERATION

If at least one existing Special Issue reaches 80%, recommend existing Special Issues and do not generate a new title.

Only when no existing Special Issue reaches 80%:

- generate 1–2 new Special Issue titles;
- make them broader than the scholar's individual publications;
- base them on the first-level field and majority direction;
- avoid combining every method, material, and application into one title.

Do not invent unsupported fashionable methods such as digital twins, generative AI, large language models, or reinforcement learning unless clearly supported by the selected information.

OUTPUT LANGUAGE

Write in Chinese.

Keep existing Special Issue titles in English.

For newly generated titles, provide English and Chinese.

Keep the result concise.

OUTPUT FORMAT

1. 一级学科与Scope判断

- 一级学科：
- 半数及以上文献的主要方向：
- 是否适合Processes：属于 / 部分属于 / 不属于
- 简要原因：

2. 已有SI推荐

推荐1

- 特刊题目：
- 匹配度：XX%
- 匹配原因：

推荐2

- 特刊题目：
- 匹配度：XX%
- 匹配原因：

推荐3

- 特刊题目：
- 匹配度：XX%
- 匹配原因：

推荐4

Only include this item when it has meaningful relevance.

3. 结论

- 是否存在80%以上匹配的已有SI：是 / 否
- 最优先推荐：
- 是否需要新建SI：是 / 否

4. 新特刊题目

Only output this section when no existing Special Issue reaches 80%.

新题目1

- 英文：
- 中文：
- 推荐原因：
- 关键词：
  - 中文 / English
  - 中文 / English
  - 中文 / English
  - 中文 / English
  - 中文 / English

新题目2

Only include this item when a genuinely distinct second option exists.

FINAL RULES

- Do not require one Special Issue to cover all publications.
- Use the direction shared by at least half of the publications.
- Recommend only existing Special Issues from the provided list.
- Do not fabricate research content.
- Do not generate a new title when any existing Special Issue reaches 80%.
`;

        const userPrompt = `
Existing Processes Special Issue title list:

${existingSI}

Scholar information selected by the user:

${selectedText}
`;

        callDeepSeek(
            systemPrompt,
            userPrompt,
            apiKey
        );
    }

    // =========================================================
    // Search query and keywords
    // =========================================================

    function generateSearchQueryAndKeywords() {
        const selectedText =
            getSelectedText();

        if (!selectedText) {
            alert(
                "Please select the Special Issue title, summary, keywords, Guest Editor interests, or scope text first."
            );

            return;
        }

        const apiKey =
            getApiKey();

        if (!apiKey) {
            return;
        }

        setOutput(
            "Generating Scilit search query and keyword list..."
        );

       const systemPrompt = `
You are an expert in bibliographic database searching, academic field classification, Boolean query design, and Special Issue potential-author discovery.

Your task is NOT simply to generate keywords for literature review.

Your primary objective is to design a literature retrieval strategy that MAXIMIZES the discovery of researchers who are plausible potential authors for a given academic Special Issue, while maintaining a reasonable thematic boundary.

The retrieved literature will later be screened using article titles, abstracts, and keywords. Therefore, prioritize RECALL over excessive precision at the initial retrieval stage.

==================================================
PRIMARY OBJECTIVE
==================================================

Given Special Issue information, construct a search strategy that:

1. Retrieves researchers directly working on the core Special Issue topic;
2. Retrieves researchers working on established technical branches that clearly belong to that topic;
3. Retrieves researchers working on important process, engineering, application, scale-up, optimization, or integration directions explicitly supported by the Special Issue;
4. Avoids unnecessarily narrow AND conditions that exclude potentially relevant authors;
5. Avoids uncontrolled expansion into the entire broader academic discipline.

The goal is to build a LARGE BUT RELEVANT potential-author pool.

Do not optimize the query only for highly specific papers.

==================================================
EVIDENCE PRIORITY
==================================================

Determine the scope using the following priority:

1. Special Issue title;
2. Special Issue aims, summary, and description;
3. Explicitly listed topics;
4. Official Special Issue keywords;
5. Graphical abstract content or graphical abstract description, if provided;
6. Guest Editor research interests.

The title defines the main conceptual boundary.

The aims, topics, keywords, and graphical abstract define important branches, applications, challenges, and emerging directions.

Guest Editor interests may support interpretation but must NOT independently broaden the Special Issue beyond its stated scope.

Ignore administrative content such as:

- manuscript deadline;
- submission instructions;
- APC;
- peer-review information;
- journal frequency;
- formatting requirements;
- English editing information.

==================================================
STEP 1 — IDENTIFY THE RETRIEVAL ARCHITECTURE
==================================================

Before constructing the query, internally identify:

A. CORE FIELD

The central scientific or engineering field explicitly represented by the Special Issue.

B. CORE TECHNOLOGIES / APPROACHES

Established methods, processes, technology families, mechanisms, or technical categories that researchers in this field commonly use.

C. APPLICATION / PROBLEM BOUNDARY

The application areas, research problems, environmental/industrial systems, target objects, or practical contexts that keep the search relevant to the Special Issue.

D. PROCESS / ENGINEERING EXTENSIONS

When supported by the Special Issue, identify relevant directions such as:

- reactor design;
- process design;
- process optimization;
- modeling;
- computational fluid dynamics;
- transport phenomena;
- continuous systems;
- process intensification;
- scale-up;
- pilot-scale application;
- industrial application;
- energy efficiency;
- economic performance;
- sustainability.

E. INTEGRATED / HYBRID DIRECTIONS

When supported by the Special Issue, identify:

- hybrid processes;
- integrated technologies;
- coupled treatment;
- combinations with other relevant technologies.

Do NOT output this internal reasoning.

==================================================
STEP 2 — BUILD MULTIPLE RETRIEVAL PATHWAYS
==================================================

Do NOT assume that one simple OR list is always sufficient.

For potential-author discovery, construct the Boolean logic conceptually from up to THREE retrieval pathways when appropriate:

PATHWAY A — Core technology + application/problem

This captures researchers directly working on the main Special Issue topic.

General structure:

(
    core field / technologies
)
AND
(
    relevant applications / problems
)

PATHWAY B — Core technology + process/engineering development

Use this pathway when the Special Issue explicitly includes reactor design, process engineering, CFD, optimization, continuous systems, scale-up, energy efficiency, industrial implementation, or similar topics.

General structure:

(
    core field / technologies
)
AND
(
    reactor / process / engineering / scale-up terms
)

PATHWAY C — Core technology + hybrid/integration/emerging directions

Use this pathway when hybridization, integration, coupled processes, sustainability, energy efficiency, or related directions are explicitly within scope.

General structure:

(
    core field / technologies
)
AND
(
    hybrid / integration / sustainability-related terms
)

Combine the applicable pathways using OR:

TITLE-ABS-KEY(
    (PATHWAY A)
    OR
    (PATHWAY B)
    OR
    (PATHWAY C)
)

Do NOT force all Special Issue aspects into one giant AND condition.

A paper does NOT need to cover every Special Issue topic to represent a useful potential author.

==================================================
STEP 3 — EXPAND THE CORE TECHNOLOGY VOCABULARY
==================================================

Expand the core topic using professional academic terminology.

Include where genuinely relevant:

- full field names;
- standard synonyms;
- spelling variants;
- major technical categories;
- well-established sub-processes;
- representative technologies;
- common mechanism-based terminology;
- commonly used database terminology.

A researcher should still be discoverable even if the exact Special Issue title does not appear in the paper.

For example, if a Special Issue concerns advanced oxidation processes, authors may publish primarily using terms such as:

- photocatalysis;
- Fenton processes;
- persulfate activation;
- ozonation;
- electrochemical oxidation;

without explicitly writing "advanced oxidation process" in every paper.

Therefore, recognized technical families should be included when supported by the Special Issue.

==================================================
STEP 4 — CONTROL RECALL AND PRECISION
==================================================

The query is intended for POTENTIAL AUTHOR DISCOVERY.

Therefore:

Prefer moderate-to-high recall.

It is acceptable to retrieve some borderline papers because a second-stage screening system will evaluate titles, abstracts, and keywords.

However, avoid terms that independently retrieve extremely broad unrelated communities.

Do NOT use vague standalone expressions such as:

- process
- system
- technology
- material
- degradation
- optimization
- simulation
- model
- treatment
- energy
- sustainability
- environment

unless they occur inside a meaningful technical phrase or are protected by an AND condition with the core field.

Do NOT use ambiguous abbreviations alone unless their meaning is highly specific in the field.

For example, avoid standalone abbreviations that have many meanings across disciplines.

Prefer the full technical expression.

==================================================
STEP 5 — DO NOT OVER-RESTRICT
==================================================

Do NOT require narrow target pollutants, specific materials, individual catalysts, individual reactor geometries, or individual applications unless they represent a major branch of the Special Issue.

Specific examples may be included in the screening keyword list without becoming mandatory search conditions.

Do NOT construct queries such as:

core technology
AND specific pollutant
AND specific catalyst
AND reactor
AND optimization

because this would exclude most relevant authors.

Remember:

The unit of interest is the RESEARCHER, not only the individual perfect-match paper.

A researcher with several relevant publications is valuable even if each individual publication covers only part of the Special Issue.

==================================================
STEP 6 — GRAPHICAL ABSTRACT
==================================================

If graphical abstract information is provided, use it as substantive scope evidence.

Extract from it:

- major challenges;
- core technologies;
- mechanisms;
- process directions;
- application areas;
- bottlenecks;
- desired outcomes.

Do NOT simply convert every label in the graphical abstract into a search term.

Use graphical abstract information to identify retrieval pathways and important screening vocabulary.

If no graphical abstract information is provided, proceed normally without it.

==================================================
BOOLEAN QUERY REQUIREMENTS
==================================================

Use Scopus-style syntax:

TITLE-ABS-KEY(...)

The complete Boolean query MUST appear on ONE SINGLE LINE.

Use quotation marks for multi-word phrases.

Use OR for:

- synonyms;
- equivalent terminology;
- parallel technical branches;
- representative technologies.

Use AND to connect only independent conceptual groups that are both necessary to preserve Special Issue relevance.

Use parentheses carefully.

The query may contain multiple OR-connected retrieval pathways.

There is NO fixed 10–30 term limit.

Use as many terms as are reasonably needed to represent the field, but avoid redundant near-duplicates and unnecessary long-tail terms.

The final query should normally be comprehensive enough for potential-author discovery but still practical for a bibliographic database.

==================================================
KEYWORD LIST
==================================================

Generate a broader keyword list for SECOND-STAGE screening of:

- article titles;
- abstracts;
- author keywords.

The keyword list should normally contain approximately 30–80 terms when the Special Issue has a broad technical scope.

It may include:

- core field terminology;
- major technical branches;
- mechanisms;
- representative technologies;
- important target problems;
- important applications;
- reactor/process terminology;
- scale-up terminology;
- hybrid/integrated process terminology;
- energy-efficiency terminology;
- sustainability terminology;
- relevant materials or pollutant classes when appropriate.

The keyword list may be broader than the Boolean search query.

Do not include Boolean operators.

Do not number the terms.

Put one keyword or phrase on each line.

==================================================
FINAL PRINCIPLES
==================================================

Always ask implicitly:

"If an active researcher would be a plausible author for this Special Issue, could this search strategy find at least one of their recent papers?"

If the answer is likely no because the query is too narrow, broaden the recognized technical vocabulary or create an additional retrieval pathway.

At the same time ask:

"Would this term retrieve a very large unrelated research community even without any connection to the Special Issue?"

If yes, remove it or constrain it using an appropriate AND group.

The final search strategy should maximize useful potential-author coverage, not merely keyword similarity to the Special Issue webpage.

Return only the requested structured output.
`;

       const userPrompt = `
The following content is taken from a Special Issue webpage.

It may contain:

- Special Issue title;
- Special Issue description;
- aims and scope;
- explicitly listed topics;
- official keywords;
- Guest Editor interests;
- affiliations;
- graphical abstract text or graphical abstract description;
- administrative information.

Your task is to generate a HIGH-RECALL literature search strategy specifically for POTENTIAL AUTHOR DISCOVERY.

==================================================
TASK
==================================================

Based on the provided Special Issue information:

1. Identify the core research field.

2. Identify its broader first-level academic field.

3. Determine whether the Special Issue requires one or multiple retrieval pathways.

4. Construct ONE final Scopus/Scilit-compatible Boolean search query.

The query should internally combine, when applicable:

A. Core technology / core research topic
   +
   relevant application or problem boundary;

B. Core technology / core research topic
   +
   process engineering, reactor design, modeling, CFD, optimization,
   continuous operation, scale-up, pilot-scale, industrial implementation,
   energy-efficiency, or related engineering directions explicitly supported
   by the Special Issue;

C. Core technology / core research topic
   +
   hybrid, integrated, coupled, sustainability, or other clearly supported
   emerging directions.

Combine applicable retrieval pathways with OR.

IMPORTANT:

Do NOT require one paper to cover all dimensions of the Special Issue.

The objective is to find researchers who could plausibly contribute to ANY substantial branch of the Special Issue.

==================================================
POTENTIAL-AUTHOR SEARCH PHILOSOPHY
==================================================

Optimize for author discovery rather than perfect-paper matching.

The search should be broad enough to retrieve:

- researchers directly publishing under the core field name;
- researchers publishing under major subfield terminology;
- researchers working on recognized technologies belonging to the field;
- researchers focusing on process engineering or scale-up aspects;
- researchers working on important integrated or hybrid approaches.

Do not depend only on literal Special Issue title wording.

Use established disciplinary knowledge to expand terminology.

At the same time, preserve the actual Special Issue boundary using appropriate application/problem/process constraints.

==================================================
GRAPHICAL ABSTRACT
==================================================

If graphical abstract information is included in the selected content:

Use it to identify:

- scientific challenges;
- technical solutions;
- mechanisms;
- engineering bottlenecks;
- application areas;
- expected outcomes.

Give graphical abstract information meaningful weight, but do not mechanically turn every graphical label into a Boolean term.

If no graphical abstract information is present, ignore this section.

==================================================
SEARCH QUERY RULES
==================================================

The final query MUST use:

TITLE-ABS-KEY(...)

The complete query MUST be on ONE SINGLE LINE.

It may use logic such as:

TITLE-ABS-KEY(((core technologies) AND (application boundary)) OR ((core technologies) AND (process engineering directions)) OR ((core technologies) AND (hybrid/integration directions)))

Only include pathways genuinely supported by the Special Issue.

Use quotation marks for multi-word phrases.

Avoid ambiguous abbreviations.

Avoid excessively narrow conditions.

Avoid generic standalone terms that would generate large irrelevant result sets.

Do NOT arbitrarily limit the query to 10–30 expressions.

Use sufficient recognized vocabulary to achieve strong potential-author recall.

==================================================
SCREENING KEYWORDS
==================================================

Generate a separate screening keyword list.

This list will later be used by an AI-based system to score exported papers based on:

- Reference/title;
- Keywords;
- Abstract.

Therefore the screening vocabulary should be broader and more granular than the Boolean retrieval query.

Prefer approximately 30–80 useful terms depending on the breadth of the Special Issue.

Include secondary technical concepts even when they should not become mandatory Boolean query terms.

==================================================
OUTPUT FORMAT
==================================================

Return STRICTLY in the following format:

[CORE_FIELD]
Core research field in English

[FIRST_LEVEL_FIELD]
Broader first-level academic field in English

[SCILIT_SEARCH_QUERY]
TITLE-ABS-KEY(...)

[KEYWORD_LIST]
keyword 1
keyword 2
keyword 3

[KEYWORD_LIST_SEMICOLON]
keyword 1；keyword 2；keyword 3

The content after [SCILIT_SEARCH_QUERY] MUST be exactly one single line.

The terms in [KEYWORD_LIST_SEMICOLON] must be identical to [KEYWORD_LIST] and in exactly the same order.

Do not add explanations before or after these sections.

==================================================
SPECIAL ISSUE CONTENT
==================================================

${selectedText}
`;

        callDeepSeek(
            systemPrompt,
            userPrompt,
            apiKey
        );
    }

    function getSelectedText() {
        const selection =
            window.getSelection();

        return selection
            ? selection
                .toString()
                .trim()
            : "";
    }

    // =========================================================
    // DeepSeek request
    // =========================================================

    function callDeepSeek(
        systemPrompt,
        userPrompt,
        apiKey
    ) {
        GM_xmlhttpRequest({
            method: "POST",
            url:
                "https://api.deepseek.com/v1/chat/completions",

            headers: {
                "Content-Type":
                    "application/json",
                "Authorization":
                    "Bearer " + apiKey
            },

            data: JSON.stringify({
                model: MODEL,

                messages: [
                    {
                        role: "system",
                        content:
                            systemPrompt
                    },
                    {
                        role: "user",
                        content:
                            userPrompt
                    }
                ],

                temperature: 0.25,
                max_tokens: 3600,
                stream: false
            }),

            timeout: 120000,

            onload: function (response) {
                try {
                    if (
                        response.status < 200 ||
                        response.status >= 300
                    ) {
                        setOutput(
                            "API request failed.\n\n" +
                            `HTTP status: ${response.status}\n` +
                            (
                                response.responseText ||
                                "No response body."
                            )
                        );

                        return;
                    }

                    const data =
                        JSON.parse(
                            response.responseText
                        );

                    if (data.error) {
                        setOutput(
                            "API Error: " +
                            (
                                data.error.message ||
                                JSON.stringify(
                                    data.error
                                )
                            )
                        );

                        return;
                    }

                    let result =
                        data.choices?.[0]
                            ?.message
                            ?.content
                            ?.trim();

                    if (!result) {
                        setOutput(
                            "No valid response returned from the API."
                        );

                        return;
                    }

                    result =
                        normalizeApiResult(
                            result
                        );

                    setOutput(result);
                    GM_setClipboard(result);
                } catch (error) {
                    setOutput(
                        "Failed to parse the API response.\n\n" +
                        String(
                            error?.message ||
                            error
                        )
                    );

                    console.error(
                        "Processes SI Matcher parse error:",
                        error,
                        response.responseText
                    );
                }
            },

            onerror: function (error) {
                setOutput(
                    "API request failed. Please check the API key, account balance, or network."
                );

                console.error(
                    "Processes SI Matcher request error:",
                    error
                );
            },

            ontimeout: function () {
                setOutput(
                    "The API request timed out. Please try again."
                );
            }
        });
    }

    function normalizeApiResult(text) {
        let result =
            String(text || "")
                .trim();

        result =
            removeMarkdownCodeFence(
                result
            );

        result =
            ensureSemicolonKeywordSection(
                result
            );

        result =
            forceSingleLineSearchQuery(
                result
            );

        return result.trim();
    }

    function removeMarkdownCodeFence(text) {
        const value =
            String(text || "")
                .trim();

        if (
            /^```[\w-]*\s*/.test(value) &&
            /```\s*$/.test(value)
        ) {
            return value
                .replace(
                    /^```[\w-]*\s*/,
                    ""
                )
                .replace(
                    /```\s*$/,
                    ""
                )
                .trim();
        }

        return value;
    }

    // =========================================================
    // Search-query formatting
    // =========================================================

    function forceSingleLineSearchQuery(
        text
    ) {
        if (
            !text ||
            !/\[SCILIT_SEARCH_QUERY\]/i.test(
                text
            )
        ) {
            return text;
        }

        const querySectionPattern =
            /(\[SCILIT_SEARCH_QUERY\]\s*)([\s\S]*?)(?=\n\s*\[KEYWORD_LIST\])/i;

        return text.replace(
            querySectionPattern,
            function (
                fullMatch,
                header,
                querySection
            ) {
                const singleLineQuery =
                    String(
                        querySection ||
                        ""
                    )
                        .replace(
                            /\r?\n+/g,
                            " "
                        )
                        .replace(
                            /\s{2,}/g,
                            " "
                        )
                        .replace(
                            /\(\s+/g,
                            "("
                        )
                        .replace(
                            /\s+\)/g,
                            ")"
                        )
                        .trim();

                return (
                    header.trim() +
                    "\n" +
                    singleLineQuery +
                    "\n\n"
                );
            }
        );
    }

    // =========================================================
    // Keyword formatting
    // =========================================================

    function ensureSemicolonKeywordSection(
        text
    ) {
        if (
            !text ||
            !/\[KEYWORD_LIST\]/i.test(
                text
            )
        ) {
            return text;
        }

        const keywords =
            extractKeywordLines(text);

        if (!keywords.length) {
            return text;
        }

        const semicolonLine =
            keywords.join("；");

        if (
            /\[KEYWORD_LIST_SEMICOLON\]/i.test(
                text
            )
        ) {
            return text.replace(
                /\[KEYWORD_LIST_SEMICOLON\][\s\S]*$/i,
                "[KEYWORD_LIST_SEMICOLON]\n" +
                semicolonLine
            );
        }

        return (
            text.trim() +
            "\n\n" +
            "[KEYWORD_LIST_SEMICOLON]\n" +
            semicolonLine
        );
    }

    function extractKeywordLines(text) {
        const match =
            String(text || "")
                .match(
                    /\[KEYWORD_LIST\]([\s\S]*?)(?=\n\s*\[KEYWORD_LIST_SEMICOLON\]|\s*$)/i
                );

        if (!match) {
            return [];
        }

        const raw =
            match[1] || "";

        const keywords =
            raw
                .split(/\r?\n/)
                .map(
                    item =>
                        item.trim()
                )
                .map(
                    item =>
                        item.replace(
                            /^[-•*]\s*/,
                            ""
                        )
                )
                .map(
                    item =>
                        item.replace(
                            /^\d+[\.\)]\s*/,
                            ""
                        )
                )
                .map(
                    item =>
                        item.replace(
                            /；/g,
                            ";"
                        )
                )
                .flatMap(
                    item =>
                        item.split(";")
                )
                .map(
                    item =>
                        item.trim()
                )
                .filter(
                    item =>
                        item.length > 1
                )
                .filter(
                    item =>
                        !/^\[.*\]$/.test(
                            item
                        )
                );

        return [
            ...new Set(keywords)
        ];
    }

    // =========================================================
    // Text cleaner
    // =========================================================

    function convertCleanerText() {
        const box =
            document.getElementById(
                UI_IDS.CLEANER_INPUT
            );

        if (!box) {
            return;
        }

        const raw =
            box.value || "";

        if (!raw.trim()) {
            alert(
                "Please paste text into the cleaner box first."
            );

            return;
        }

        const cleaned =
            raw
                .replace(
                    /\r?\n+/g,
                    " "
                )
                .replace(
                    /\t+/g,
                    " "
                )
                .replace(
                    /\s{2,}/g,
                    " "
                )
                .trim();

        box.value = cleaned;
        GM_setClipboard(cleaned);

        alert(
            "Converted to one paragraph and copied."
        );
    }

    function clearCleanerText() {
        const box =
            document.getElementById(
                UI_IDS.CLEANER_INPUT
            );

        if (box) {
            box.value = "";
        }
    }

    // =========================================================
    // Copy output
    // =========================================================

    function copyOutput() {
        const outputBox =
            getOutputBox();

        if (!outputBox) {
            return;
        }

        const text =
            outputBox.value.trim();

        if (!text) {
            alert(
                "There is no result to copy."
            );

            return;
        }

        GM_setClipboard(text);

        alert(
            "Result copied."
        );
    }
})();
