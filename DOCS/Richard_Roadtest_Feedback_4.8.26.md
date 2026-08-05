## Roadtest Feedback & Feature Implementation Specification

---

### Tab 1: Capture

* [ ] **UI Layout — Microphone Button:** Relocate the microphone button to top-center.
* **Objective:** Ensure continuous accessibility while reclaiming vertical screen space for the main output container.


* [ ] **UI Layout — Output Field Scrolling:** Enable vertical scrolling (`overflow-y: auto`) on the response output container to handle long output strings without layout overflow.
* [ ] **UX / Copy Update — Voice Feedback Notice:** Refactor the fallback text:
* **Current:** `(silent mode) Voice feedback is unavailable in this browser ... Please pair phone in 'Bridge' for voice feedback`
* **Target:** Update notice to cleanly direct users to pair via the **Bridge** tab for active audio streaming.



---

### Tab 2: Chat

* [ ] **UI Layout — Input Controls:**
* Add a `+` (Upload) button anchored to the far left of the chat input box.
* Add a microphone stub button directly to the right of the `Send` button (matched to `Send` button dimensions).



---

### Tab 3: Agents

* [ ] **UI Layout — Card Grid:** Resize Created Agent cards to 50% width and 33% height, arranging them into two scrollable horizontal/grid rows.
* [ ] **Feature — Health Check Button:** Add a radio tower icon button to each agent card.
* **Function:** Ping agent endpoint and verify `200 OK` status.
* **Layout:** Adjust action button layout so all 3 buttons fit cleanly alongside model metadata.


* [ ] **Bug Fix — Color Picker:** Resolve state/event handler failure preventing color selection during agent creation.
* [ ] **Bug Fix & Default — System Prompt Input:**
* **Bug:** Keyboard fails to activate when targeting the 'System Prompt' field, blocking agent creation completion.
* **Change:** Remove mandatory user input block; pre-fill 'System Prompt' with a default fallback prompt string upon agent initialization.


* [ ] **Bug Fix — Android Auto Viewport Jumps:** Fix scrolling jitter/jump behavior on car display viewports.
* [ ] **CRITICAL BUG FIX — Provider Dropdown Crash:**
* **Issue:** Selecting or editing the Provider dropdown in Agent Edit crashes Android Auto and drops host connection requiring reboot.
* **Task:** Isolate dropdown DOM/event handling to prevent native display server crashes.


* [ ] **Bug Fix — Model Fetch Dropdown:** Resolve failure where dropdown fails to populate/interact after fetching models on mobile browsers and Fermata Auto.

---

### Tab 4: Bridge

* [ ] **Bug Fix — Car Display Input Registration:**
* **Issue:** Tapping the pairing code field on the car display activates the keyboard, but keypress events fail to populate the input value.
* **Task:** Fix touch/focus event mapping for external vehicle display input fields.



---

### Tab 5: Settings

* [ ] **Feature — Cross-Device Settings Sync:**
* Implement auto-syncing of API keys and configuration profiles from the paired mobile device to eliminate manual typing/pasting inside Android Auto.



---

### Architectural Refactoring & New Features

```
[ Current Structure ]               [ Proposed Structure ]
├── Capture                         ├── Voice Chat (Combined Capture + Chat)
├── Chat                            ├── Ideas (Inherits Capture notes, collapsible)
├── Agents                          ├── Agents (Refactored layout + bugfixes)
├── Bridge                          ├── Bridge (Fixed input sync)
└── Settings                        ├── History (New tab with collapsible logs)
                                    └── Settings (Auto-sync enabled)

```

1. **Voice Chat Tab (Unified):** Merge `Capture` and `Chat` workflows into a single interface optimized for hands-free and touch interaction.
2. **Ideas Tab Refactor:** Transition legacy `Capture` notes into the `Ideas` view as collapsible/expandable jotted notes with inline commenting.
3. **Persistent Agent & Custom Wake-Word:** Enable persistent agent selection state across application sessions, including custom wake-word mapping.
4. **New History Tab:** Implement a dedicated log tab utilizing collapsible containers to maximize space on small displays. Include a display mode toggle to adapt layout across varying aspect ratios.
