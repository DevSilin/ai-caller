# LandVerse AI Agent - Complete Call Flow Specification
## EVERY STATE, EVERY BRANCH, EVERY WORD

---

# DOCUMENT OVERVIEW

This document specifies **EVERY** possible path through a call. Nothing is left to interpretation.

**How to read this document:**
- Each STATE is a discrete point in the conversation
- Each state has ENTRY CONDITIONS, SCRIPTS, DETECTION PATTERNS, and TRANSITIONS
- Follow the arrows (→) to see where each response leads
- Variables in {curly braces} are dynamic
- [Brackets] indicate stage directions/instructions for the AI

---

# TABLE OF CONTENTS

1. [Pre-Call Configuration](#1-pre-call-configuration)
2. [Call Initialization](#2-call-initialization)
3. [Phase 1: Cold Calling States](#3-phase-1-cold-calling)
4. [Escalation Decision](#4-escalation-decision)
5. [Phase 2: Acquisition States](#5-phase-2-acquisition)
6. [Contract Flow](#6-contract-flow)
7. [Terminal States](#7-terminal-states)
8. [Global Handlers](#8-global-handlers)
9. [Edge Case Handlers](#9-edge-case-handlers)
10. [Appendices](#10-appendices)

---

# 1. PRE-CALL CONFIGURATION

## 1.1 Required Configuration Variables

```javascript
const CONFIG = {
  // Company Information
  companyName: "LandVerse",
  companyLegalName: "LandVerse LLC",
  companyAddress: "123 Main Street, Austin, TX 78701",
  companyPhone: "+15125551234",
  
  // Agent Identity
  agentName: "Alex",
  agentRole: "Land Acquisition Specialist",
  
  // Agent Mode (CRITICAL - determines escalation behavior)
  agentMode: "SOLO", // "SOLO" = can close deals, "TEAM" = appointment only
  
  // Acquisition Manager (for TEAM mode appointments)
  acquisitionManager: {
    name: "Jordan",
    gender: "male", // for pronouns
    phone: "+15125555678",
    email: "jordan@landverse.com",
    calendarId: "jordan_calendar_id"
  },
  
  // Title Company
  titleCompany: {
    name: "First American Title",
    address: "456 Title Way, Austin, TX 78702",
    contact: "Sarah Johnson",
    email: "sarah@firstamerican.com",
    phone: "+15125559999"
  },
  
  // Pricing Authority
  pricing: {
    maxAutonomousOffer: 75000,      // AI can offer up to this without approval
    absoluteMaxOffer: 200000,        // AI can NEVER offer above this
    requiresApprovalAbove: 75000,    // Offers above this need human approval
    approvalTimeout: 300,            // Seconds to wait for approval
    approvalChannel: "#deal-approvals" // Slack channel
  },
  
  // Timing
  timing: {
    defaultClosingDays: 30,
    doubleCloseClosingDays: 90,
    dueDiligenceDays: 14,
    doubleCloseDueDiligenceDays: 60
  },
  
  // Recording
  recording: {
    enabled: true,
    twoPartyConsentStates: ["CA", "CT", "FL", "IL", "MD", "MA", "MI", "MT", "NH", "PA", "WA"]
  }
};
```

## 1.2 Required Lead Data Structure

```javascript
const LEAD_SCHEMA = {
  // REQUIRED - Call will not proceed without these
  required: {
    id: "string",                    // Unique lead identifier
    firstName: "string",             // Seller's first name
    lastName: "string",              // Seller's last name  
    phone: "string",                 // Phone number (E.164 format)
    propertyAddress: "string",       // Property street address
    county: "string",                // Property county
    state: "string",                 // Property state (2-letter)
    acreage: "number"                // Property size in acres
  },
  
  // RECOMMENDED - Improves call quality
  recommended: {
    email: "string",                 // For DocuSign
    mailingAddress: "string",        // Seller's mailing address
    apn: "string",                   // Assessor Parcel Number
    legalDescription: "string",      // Legal property description
    purchaseDate: "date",            // When seller acquired property
    roadName: "string",              // Road/street name for personalization
    mailingState: "string"           // To detect out-of-state owners
  },
  
  // PRICING - Required for offers
  pricing: {
    lowOffer: "number",              // Starting offer
    targetOffer: "number",           // Target price
    maxOffer: "number",              // Maximum authorized offer
    pricePerAcre: "number",          // For reference
    compSource: "string"             // How pricing was calculated
  },
  
  // OPTIONAL - Additional intelligence
  optional: {
    parcelCount: "number",           // Number of parcels owned
    nearDevelopment: "boolean",      // Near growth/development
    zoning: "string",                // Property zoning
    floodZone: "string",             // Flood zone designation
    annualTaxes: "number",           // Annual property taxes
    priorContact: "boolean"          // Previously contacted
  }
};
```

## 1.3 Call Context Object (Runtime State)

```javascript
// This object tracks everything during the call
const callContext = {
  // Call metadata
  callId: null,
  startTime: null,
  currentState: null,
  previousStates: [],
  
  // Lead data (loaded at start)
  lead: null,
  
  // Conversation tracking
  transcript: "",
  lastAgentStatement: "",
  lastSellerResponse: "",
  
  // Interest and qualification
  interestLevel: 0,           // -2 (hostile) to +2 (very interested)
  qualificationScore: 0,      // 0-100
  motivationType: null,       // Detected motivation
  
  // Key information collected
  keyInfo: {
    ownershipConfirmed: false,
    ownershipYears: null,
    hasCoOwner: false,
    coOwnerName: null,
    coOwnerRelation: null,
    coOwnerPresent: false,
    decisionMaker: true,
    hasOtherOffers: false,
    otherOfferDetails: null,
    timeline: null,
    priceExpectation: null,
    motivation: null,
    propertyIssues: []
  },
  
  // Contract data (collected during call)
  contractData: {
    sellerLegalName: null,
    sellerEmail: null,
    sellerMailingAddress: null,
    agreedPrice: null,
    closingDays: null,
    dealStructure: "STANDARD"  // or "DOUBLE_CLOSE"
  },
  
  // Appointment data
  appointment: {
    scheduled: false,
    dateTime: null,
    with: null,
    email: null,
    reminderMethod: null
  },
  
  // Tracking
  objectionCount: 0,
  escalationAttempted: false,
  contractSent: false,
  contractSigned: false,
  
  // Flags
  flags: [],
  errors: []
};
```

---

# 2. CALL INITIALIZATION

## STATE: INIT

**Purpose:** Initialize call, load data, validate prerequisites

**Entry Condition:** Call connected (or about to connect)

**Actions:**
```javascript
async function initializeCall(leadId) {
  // 1. Load lead data
  const lead = await loadLeadData(leadId);
  
  // 2. Validate required fields
  const validation = validateLeadData(lead);
  if (!validation.valid) {
    logError("Lead validation failed", validation.errors);
    return { abort: true, reason: validation.errors };
  }
  
  // 3. Check pricing availability
  if (!lead.pricing || !lead.pricing.maxOffer) {
    if (CONFIG.agentMode === "SOLO") {
      // Cannot escalate without pricing
      callContext.flags.push("NO_PRICING_APPOINTMENT_ONLY");
    }
  }
  
  // 4. Determine recording consent requirement
  const sellerState = lead.state;
  callContext.requiresRecordingConsent = CONFIG.recording.twoPartyConsentStates.includes(sellerState);
  
  // 5. Calculate derived fields
  lead.fullName = `${lead.firstName} ${lead.lastName}`;
  lead.ownershipYears = lead.purchaseDate 
    ? Math.floor((Date.now() - new Date(lead.purchaseDate)) / (365.25 * 24 * 60 * 60 * 1000))
    : null;
  lead.isOutOfState = lead.mailingState && lead.mailingState !== lead.state;
  
  // 6. Select opener strategy
  callContext.openerStrategy = selectOpenerStrategy(lead);
  
  // 7. Store in context
  callContext.lead = lead;
  callContext.startTime = Date.now();
  callContext.currentState = "INIT";
  
  // 8. Log call start
  await triggerWebhook("call_started", {
    callId: callContext.callId,
    leadId: lead.id,
    timestamp: new Date().toISOString()
  });
  
  // 9. Transition
  return { nextState: "RECORDING_DISCLOSURE" };
}
```

**Opener Strategy Selection Logic:**
```javascript
function selectOpenerStrategy(lead) {
  // Priority 1: Use specific intel if available
  if (lead.nearDevelopment && lead.roadName) {
    return "NEIGHBOR_ANGLE";
  }
  if (lead.isOutOfState) {
    return "OUT_OF_STATE";
  }
  if (lead.ownershipYears && lead.ownershipYears >= 10) {
    return "LONG_TIME_OWNER";
  }
  if (lead.parcelCount && lead.parcelCount > 1) {
    return "MULTIPLE_PARCELS";
  }
  
  // Priority 2: Seasonal
  const month = new Date().getMonth();
  if (month >= 0 && month <= 3) { // Jan-Apr
    return "TAX_SEASON";
  }
  
  // Priority 3: Random selection from proven openers
  const openers = [
    { id: "PATTERN_INTERRUPT", weight: 25 },
    { id: "HONEST_APPROACH", weight: 20 },
    { id: "QUESTION_OPENER", weight: 20 },
    { id: "DIRECT_VALUE_PROP", weight: 15 },
    { id: "PROBLEM_SOLVER", weight: 10 },
    { id: "SOFT_ASSUMPTION", weight: 10 }
  ];
  
  return weightedRandomSelect(openers);
}
```

**Transition:**
→ Always proceeds to `RECORDING_DISCLOSURE`

---

## STATE: RECORDING_DISCLOSURE

**Purpose:** Provide legally required recording disclosure

**Entry Condition:** Coming from INIT

**Logic:**
```javascript
if (callContext.requiresRecordingConsent) {
  // Must disclose
  proceedWithDisclosure();
} else {
  // Skip directly to opener
  return { nextState: "P1_OPENING" };
}
```

**Agent Says:**
```
"This call may be recorded for quality purposes."
```

**[PAUSE: 1 second - do not wait for response, just brief pause]**

**Detection - If Seller Interrupts/Objects:**

| Seller Says | Intent | Response |
|-------------|--------|----------|
| "Don't record" / "I don't want to be recorded" | OBJECTS_TO_RECORDING | Handle objection |
| "That's fine" / "Okay" | ACCEPTS_RECORDING | Continue |
| [No response] | SILENCE | Continue |

**If OBJECTS_TO_RECORDING:**
```
Agent: "No problem at all. I'll make sure we're not recording. Let me just grab a pen to take some notes instead."

[ACTION: Disable recording]
await triggerWebhook("disable_recording", { callId: callContext.callId });
callContext.recordingEnabled = false;
```

**Transition:**
→ `P1_OPENING`

---

# 3. PHASE 1: COLD CALLING

## STATE: P1_OPENING

**Purpose:** Deliver opening hook, establish conversation, gauge initial interest

**Entry Condition:** After recording disclosure (or directly from INIT if no disclosure needed)

### OPENER SCRIPTS

Each opener is designed for a specific situation. The AI selects ONE based on the strategy determined in INIT.

---

#### OPENER: PATTERN_INTERRUPT

**Best for:** General use, breaks through auto-rejection

**Script:**
```
"Hi {lead.firstName}, I know you weren't expecting my call... I'm {CONFIG.agentName} with {CONFIG.companyName} and I'm actually calling about something that might benefit you. Got 27 seconds for me to explain why I'm calling?"
```

**Key elements:**
- "I know you weren't expecting my call" - acknowledges cold call
- "27 seconds" - specific odd number creates curiosity
- Ends with question to get engagement

---

#### OPENER: HONEST_APPROACH

**Best for:** Building trust with skeptical leads

**Script:**
```
"Hi {lead.firstName}, this is {CONFIG.agentName} with {CONFIG.companyName}. Look, I know cold calls are annoying, but I'm reaching out to land owners in {lead.county} because we're actively buying property. Would you be opposed to a 5-minute conversation if it could put cash in your pocket?"
```

**Key elements:**
- "cold calls are annoying" - disarms defensiveness
- "would you be opposed" - negative phrasing gets more yeses
- "cash in your pocket" - immediate value proposition

---

#### OPENER: QUESTION_OPENER

**Best for:** Confirming ownership while building engagement

**Script (Part 1 - Ownership Confirmation):**
```
"Hi, is this {lead.firstName}?"
```

**[WAIT FOR RESPONSE]**

**If YES:**
```
"Great! Quick question - are you still the owner of the {lead.acreage} acres on {lead.roadName}?"
```

**[WAIT FOR RESPONSE]**

**If YES (owns property):**
```
"Perfect! I'm {CONFIG.agentName} with {CONFIG.companyName} - we buy land in {lead.county} and I wanted to see if you'd ever thought about what you'd do if someone made you a cash offer on it?"
```

**If NO (not owner):**
→ Transition to `WRONG_PERSON` handler

---

#### OPENER: DIRECT_VALUE_PROP

**Best for:** Busy people, getting to the point

**Script:**
```
"Hi {lead.firstName}, I'll be super brief - I'm {CONFIG.agentName} and I buy land in {lead.county} for cash, no agents, no fees. I'm calling to see if you'd consider selling your {lead.acreage} acres if I could close in 30 days?"
```

**Key elements:**
- "super brief" - respects their time
- "cash, no agents, no fees" - immediate differentiators
- "close in 30 days" - concrete timeline

---

#### OPENER: PROBLEM_SOLVER

**Best for:** Addressing common pain points

**Script:**
```
"Hi {lead.firstName}, {CONFIG.agentName} here with {CONFIG.companyName}. I'm calling because a lot of land owners in {lead.county} are dealing with rising property taxes on vacant land they're not using. Is that something you're experiencing with your {lead.acreage} acres?"
```

**Key elements:**
- Leads with problem (taxes)
- Ends with question about their situation
- Opens conversation about pain points

---

#### OPENER: SOFT_ASSUMPTION

**Best for:** Gentle approach, less aggressive

**Script:**
```
"Hi {lead.firstName}? ... {CONFIG.agentName} calling about your vacant land in {lead.county}. I imagine holding onto unused property isn't ideal for everyone. How's that working out for you?"
```

**Key elements:**
- "I imagine" - soft assumption, not accusation
- "How's that working out" - open-ended, invites sharing
- Conversational tone

---

#### OPENER: OUT_OF_STATE (Custom Intel)

**Condition:** `lead.isOutOfState === true`

**Script:**
```
"Hi {lead.firstName}, I noticed you own land here in {lead.county} but you're living out in {lead.mailingState}. Managing property from a distance can be a hassle - ever thought about selling?"
```

**Key elements:**
- Shows you did research
- Identifies specific pain point (distance)
- Direct question

---

#### OPENER: LONG_TIME_OWNER (Custom Intel)

**Condition:** `lead.ownershipYears >= 10`

**Script:**
```
"Hi {lead.firstName}, looks like you've owned your {lead.acreage} acres since {lead.purchaseYear}. With how much the area's changed, have you considered what your property might be worth today?"
```

**Key elements:**
- Shows research (specific year)
- "how much the area's changed" - implies value increase
- Curiosity about value

---

#### OPENER: MULTIPLE_PARCELS (Custom Intel)

**Condition:** `lead.parcelCount > 1`

**Script:**
```
"Hi {lead.firstName}, I see you own several parcels in {lead.county}. I'm {CONFIG.agentName} with {CONFIG.companyName} - we sometimes buy entire portfolios. Would you be open to discussing your properties?"
```

**Key elements:**
- Shows awareness of portfolio
- "entire portfolios" - bigger opportunity
- Plural "properties"

---

#### OPENER: NEIGHBOR_ANGLE (Custom Intel)

**Condition:** `lead.nearDevelopment === true && lead.roadName`

**Script:**
```
"Hi {lead.firstName}, {CONFIG.agentName} here. We just bought a property near yours on {lead.roadName} and I wanted to reach out since we're looking for more land in that exact area. Any chance you've thought about selling?"
```

**Key elements:**
- "just bought nearby" - establishes presence
- "that exact area" - specificity builds credibility
- Social proof of activity

---

#### OPENER: TAX_SEASON (Seasonal)

**Condition:** Month is January-April

**Script:**
```
"Hi {lead.firstName}, with tax season coming up, I'm reaching out to property owners who might want to convert their vacant land to cash. This is {CONFIG.agentName} with {CONFIG.companyName} - got a minute?"
```

**Key elements:**
- Timely/relevant
- "convert to cash" - action-oriented
- Short and direct

---

### OPENER RESPONSE HANDLING

**[CRITICAL: After delivering opener, STOP and LISTEN. Do not speak until seller responds. Wait up to 8 seconds.]**

**Detection Patterns for Opener Responses:**

```javascript
const OPENER_RESPONSE_PATTERNS = {
  
  // ═══════════════════════════════════════════════════════════════
  // POSITIVE RESPONSES - Seller shows interest
  // ═══════════════════════════════════════════════════════════════
  POSITIVE_ENGAGED: {
    patterns: [
      "yes", "sure", "okay", "go ahead", "tell me more",
      "I'm listening", "what do you have", "I'm interested",
      "yeah", "yep", "uh huh", "alright"
    ],
    interestDelta: +1,
    nextState: "P1_CONFIRM_OWNER"
  },
  
  POSITIVE_HOT: {
    patterns: [
      "I've been thinking about selling",
      "I want to sell",
      "I've been wanting to sell",
      "how much would you offer",
      "what would you pay",
      "what's your offer",
      "I might be interested",
      "depends on the price",
      "make me an offer"
    ],
    interestDelta: +2,
    nextState: "ESCALATION_CHECK",
    flag: "HOT_TRIGGER_ON_OPENER"
  },
  
  // ═══════════════════════════════════════════════════════════════
  // NEUTRAL RESPONSES - Need more information
  // ═══════════════════════════════════════════════════════════════
  NEUTRAL_CURIOUS: {
    patterns: [
      "who is this", "what company", "what's this about",
      "how did you get my number", "where are you calling from"
    ],
    interestDelta: 0,
    nextState: "P1_HANDLE_INQUIRY"
  },
  
  NEUTRAL_CONFUSED: {
    patterns: [
      "what", "huh", "I don't understand", "what do you mean",
      "what property", "which land"
    ],
    interestDelta: 0,
    nextState: "P1_CLARIFY"
  },
  
  // ═══════════════════════════════════════════════════════════════
  // NEGATIVE RESPONSES - Resistance
  // ═══════════════════════════════════════════════════════════════
  SOFT_NEGATIVE: {
    patterns: [
      "not really", "I don't think so", "probably not",
      "not right now", "not at this time", "I'm not sure",
      "no thanks", "not interested right now"
    ],
    interestDelta: -1,
    nextState: "P1_SOFT_OBJECTION"
  },
  
  HARD_NEGATIVE: {
    patterns: [
      "not interested", "no", "absolutely not", "never",
      "don't call me", "stop calling", "no way"
    ],
    interestDelta: -2,
    nextState: "P1_HARD_OBJECTION"
  },
  
  // ═══════════════════════════════════════════════════════════════
  // TIMING RESPONSES - Bad time
  // ═══════════════════════════════════════════════════════════════
  BAD_TIMING: {
    patterns: [
      "bad time", "I'm busy", "in a meeting", "at work",
      "driving", "can't talk", "call me back", "not now"
    ],
    interestDelta: 0,
    nextState: "P1_RESCHEDULE"
  },
  
  // ═══════════════════════════════════════════════════════════════
  // SPECIAL CASES
  // ═══════════════════════════════════════════════════════════════
  VOICEMAIL: {
    patterns: [
      "leave a message", "voicemail", "beep", "not available",
      "please leave", "after the tone"
    ],
    nextState: "VOICEMAIL_HANDLER"
  },
  
  WRONG_NUMBER: {
    patterns: [
      "wrong number", "no one by that name", "don't know them",
      "never heard of", "doesn't live here"
    ],
    nextState: "WRONG_NUMBER_HANDLER"
  },
  
  DECEASED: {
    patterns: [
      "passed away", "died", "deceased", "no longer with us",
      "passed on"
    ],
    nextState: "DECEASED_HANDLER"
  },
  
  DNC_REQUEST: {
    patterns: [
      "do not call", "stop calling me", "remove my number",
      "take me off", "never call again", "harassment"
    ],
    nextState: "DNC_HANDLER"
  },
  
  ROBOT_INQUIRY: {
    patterns: [
      "are you a robot", "is this a robot", "am I talking to a robot",
      "is this AI", "are you a real person", "are you human"
    ],
    nextState: "AI_DISCLOSURE_HANDLER"
  }
};
```

**Response Processing:**
```javascript
async function processOpenerResponse(response) {
  const normalizedResponse = response.toLowerCase().trim();
  
  // Check each pattern category
  for (const [intent, config] of Object.entries(OPENER_RESPONSE_PATTERNS)) {
    for (const pattern of config.patterns) {
      if (normalizedResponse.includes(pattern)) {
        // Update interest level
        if (config.interestDelta) {
          callContext.interestLevel += config.interestDelta;
        }
        
        // Add any flags
        if (config.flag) {
          callContext.flags.push(config.flag);
        }
        
        // Return next state
        return { 
          intent, 
          nextState: config.nextState,
          matchedPattern: pattern
        };
      }
    }
  }
  
  // Default: treat as neutral/curious
  return { 
    intent: "UNCLEAR", 
    nextState: "P1_CONFIRM_OWNER" 
  };
}
```

---

## STATE: P1_HANDLE_INQUIRY

**Purpose:** Answer questions about who we are / how we got their number

**Entry Condition:** Seller asked "who is this" / "how did you get my number" type questions

**Detection & Response Matrix:**

| Seller Question | Agent Response |
|-----------------|----------------|
| "Who is this?" / "What company?" | "I'm {CONFIG.agentName} with {CONFIG.companyName}. We're a local land investment company that buys property directly from owners. We've been buying in {lead.county} for several years now." |
| "How did you get my number?" | "We use public property records to find land owners in {lead.county}. Your name came up as the owner of the property on {lead.roadName}, so I wanted to reach out directly. Is this something you'd ever consider - selling the property?" |
| "Where are you calling from?" | "I'm calling from {CONFIG.companyName} here in Texas. We buy land throughout the state and I noticed you have property in {lead.county}." |
| "What do you want?" | "I'll cut right to it - we buy land for cash and I'm calling to see if you'd ever consider selling your {lead.acreage} acres in {lead.county}. Would that be something you'd be open to discussing?" |

**After answering, always pivot back to interest:**
```
"So, is selling your property something you've ever thought about?"
```

**[WAIT FOR RESPONSE]**

**Transition:**
→ Process response using `OPENER_RESPONSE_PATTERNS`
→ Most likely → `P1_CONFIRM_OWNER` or `P1_SOFT_OBJECTION`

---

## STATE: P1_CLARIFY

**Purpose:** Clarify when seller is confused

**Entry Condition:** Seller said "what?" / "huh?" / "I don't understand"

**Agent Says:**
```
"Sorry, let me start over. I'm {CONFIG.agentName} with {CONFIG.companyName}. I'm calling because you own {lead.acreage} acres in {lead.county}, and I wanted to see if you'd ever consider selling it for cash. Is that something you might be interested in?"
```

**[WAIT FOR RESPONSE]**

**Transition:**
→ Process response using `OPENER_RESPONSE_PATTERNS`

---

## STATE: P1_RESCHEDULE

**Purpose:** Schedule callback when it's a bad time

**Entry Condition:** Seller indicated bad timing

**Agent Says:**
```
"No problem at all! When would be a better time for a quick 2-minute call?"
```

**[WAIT FOR RESPONSE]**

**Detection:**

| Seller Response | Action |
|-----------------|--------|
| Gives specific time ("tomorrow at 2", "this evening") | Extract time, confirm, schedule |
| Vague time ("later", "sometime") | Ask for specific time |
| "Don't call back" | → `P1_HARD_OBJECTION` |
| "I'll call you" | Provide callback number |

**If specific time given:**
```
"Perfect! I'll give you a call {extracted_time}. Is this still the best number to reach you at?"

[WAIT FOR CONFIRMATION]

"Great! Talk to you then. Have a good {time_of_day}!"
```

**If vague:**
```
"Sure thing! Would tomorrow morning or afternoon work better for you?"

[WAIT FOR RESPONSE]

[Extract preference, confirm]
```

**If "I'll call you":**
```
"Sounds good! Our number is {CONFIG.companyPhone}. Ask for {CONFIG.agentName}. I look forward to hearing from you!"
```

**Actions:**
```javascript
await triggerWebhook("schedule_callback", {
  leadId: callContext.lead.id,
  callbackTime: extractedDateTime,
  reason: "seller_requested",
  notes: "Seller was busy, asked to call back"
});
```

**Transition:**
→ `END_CALLBACK_SCHEDULED`

---

## STATE: P1_SOFT_OBJECTION

**Purpose:** Handle soft resistance, dig deeper

**Entry Condition:** Seller said "not really", "probably not", "not right now"

**Objection Attempt Counter:**
```javascript
callContext.objectionAttempts = (callContext.objectionAttempts || 0) + 1;
```

**Response Based on Attempt Number:**

### Attempt 1:
```
"I totally understand. Just out of curiosity, is that because you have plans for the property, or you're just not ready right now?"
```

**[WAIT FOR RESPONSE]**

**Detection:**

| Response Type | Next Action |
|---------------|-------------|
| Has plans ("going to build", "for my kids", "retirement") | → `P1_EXPLORE_PLANS` |
| Not ready ("not the right time", "maybe later") | → Attempt 2 |
| Shows interest ("well, maybe if...", "depends on...") | → `P1_INTEREST_PROBE` |
| Still no ("no, just not interested") | → Attempt 2 |

### Attempt 2:
```
"Got it. Would it be crazy if I asked - what would have to happen for you to consider selling?"
```

**[WAIT FOR RESPONSE]**

**Detection:**

| Response Type | Next Action |
|---------------|-------------|
| Gives condition ("if the price was right", "if I needed money") | → `P1_INTEREST_PROBE` |
| No condition ("nothing", "I'm just not selling") | → Attempt 3 |
| Opens up (shares situation) | → `P1_QUALIFYING` |

### Attempt 3:
```
"I hear you. Can I ask - if someone made you a cash offer that was too good to refuse, would you at least listen?"
```

**[WAIT FOR RESPONSE]**

**Detection:**

| Response Type | Next Action |
|---------------|-------------|
| Yes/Maybe | → `P1_INTEREST_PROBE` |
| No | → `P1_GRACEFUL_EXIT` |

**Transition after 3 failed attempts:**
→ `P1_GRACEFUL_EXIT`

---

## STATE: P1_EXPLORE_PLANS

**Purpose:** Understand seller's plans for the property

**Entry Condition:** Seller mentioned having plans

**Agent Says:**
```
"Oh interesting! What are you planning to do with the property?"
```

**[WAIT FOR RESPONSE]**

**Detection & Follow-up:**

| Plans Mentioned | Follow-up Question |
|-----------------|-------------------|
| "Build a house" | "Nice! Have you started that process yet, or is it still in the planning phase?" |
| "For my kids/family" | "That's thoughtful. Have you discussed it with them? Do they want it?" |
| "Investment/hold" | "Smart. How long are you planning to hold it? Sometimes our offers beat the long-term hold value." |
| "Retirement" | "When are you thinking of retiring? Would having cash now help with that?" |
| "Not sure yet" | "Got it. Well, if you ever want to know what it's worth to a cash buyer, I'm happy to give you a number." |

**Looking for opportunities:**
- Plans that haven't started → May be open if price is right
- Kids don't want it → Potential motivation
- Holding but not using → Tax burden angle

**Transition:**
→ Based on response, either `P1_INTEREST_PROBE` (if opportunity found) or `P1_GRACEFUL_EXIT` (if firm plans)

---

## STATE: P1_HARD_OBJECTION

**Purpose:** Handle firm rejection gracefully

**Entry Condition:** Seller said "no", "not interested", "stop calling"

**Check for DNC language first:**
```javascript
const dncPatterns = ["stop calling", "do not call", "never call", "harassment", "remove my number"];
if (dncPatterns.some(p => response.toLowerCase().includes(p))) {
  return { nextState: "DNC_HANDLER" };
}
```

**Agent Says:**
```
"I completely understand. Would it be alright if I checked back in 6 months to see if anything has changed?"
```

**[WAIT FOR RESPONSE]**

**Detection:**

| Response | Action |
|----------|--------|
| "Sure" / "Fine" / "I guess" | Schedule 6-month follow-up |
| "No" / "Don't bother" | Accept and exit gracefully |
| Softens ("well, maybe...") | → `P1_SOFT_OBJECTION` |

**If permission to follow up:**
```
"I appreciate that. I'll make a note in my calendar. If anything changes before then, feel free to give us a call at {CONFIG.companyPhone}. Have a great {time_of_day}!"
```

**If no permission:**
```
"No problem at all. If you ever change your mind, our number is {CONFIG.companyPhone}. Take care!"
```

**Transition:**
→ `END_NOT_INTERESTED` or `END_CALLBACK_SCHEDULED` (6 months)

---

## STATE: P1_GRACEFUL_EXIT

**Purpose:** End call politely when there's no opportunity

**Entry Condition:** Multiple objection attempts failed, no interest

**Agent Says:**
```
"No problem at all! I appreciate you taking the time to chat. If anything ever changes and you decide you want to look at selling, give us a call at {CONFIG.companyPhone}. Have a great {time_of_day}!"
```

**Actions:**
```javascript
await triggerWebhook("update_lead_status", {
  leadId: callContext.lead.id,
  status: "not_interested",
  reason: "no_interest_after_objection_handling",
  followUpDate: addMonths(new Date(), 6),
  notes: callContext.keyInfo
});
```

**Transition:**
→ `END_NOT_INTERESTED`

---

## STATE: P1_CONFIRM_OWNER

**Purpose:** Verify we're speaking with the property owner

**Entry Condition:** Positive or neutral response to opener

**Agent Says:**
```
"Great! Just to make sure I have the right person - are you the owner of the {lead.acreage} acres on {lead.roadName || 'the property'} in {lead.county}?"
```

**[WAIT FOR RESPONSE]**

**Detection:**

```javascript
const OWNER_CONFIRMATION_PATTERNS = {
  CONFIRMED_SOLE: {
    patterns: ["yes", "that's me", "I am", "correct", "yep", "yeah", "I own it"],
    action: () => {
      callContext.keyInfo.ownershipConfirmed = true;
      callContext.keyInfo.hasCoOwner = false;
    },
    nextState: "P1_INTEREST_PROBE"
  },
  
  CONFIRMED_JOINT: {
    patterns: [
      "yes with my wife", "yes with my husband", "co-own", 
      "me and my", "my wife and I", "my husband and I",
      "we own it", "family owns", "inherited with"
    ],
    action: () => {
      callContext.keyInfo.ownershipConfirmed = true;
      callContext.keyInfo.hasCoOwner = true;
      // Try to extract co-owner relation
      const relation = extractCoOwnerRelation(response);
      callContext.keyInfo.coOwnerRelation = relation;
    },
    nextState: "P1_COOWNER_CHECK"
  },
  
  NOT_OWNER: {
    patterns: [
      "no", "that's not me", "I don't own", "sold it", 
      "wrong person", "someone else"
    ],
    nextState: "P1_FIND_OWNER"
  },
  
  DECEASED_OWNER: {
    patterns: [
      "they passed away", "died", "deceased", "in probate", "estate"
    ],
    nextState: "DECEASED_HANDLER"
  },
  
  PARTIAL_INFO: {
    patterns: [
      "which property", "I own a few", "which one", "I have several"
    ],
    nextState: "P1_CLARIFY_PROPERTY"
  }
};
```

---

## STATE: P1_COOWNER_CHECK

**Purpose:** Understand co-owner situation and whether they can proceed

**Entry Condition:** Seller confirmed joint ownership

**Agent Says:**
```
"Got it, so you co-own the property with your {coOwnerRelation}. That's totally fine - we work with joint owners all the time. Is {he/she} aware that we're having this conversation?"
```

**[WAIT FOR RESPONSE]**

**Detection:**

| Response | Follow-up |
|----------|-----------|
| "Yes" / "They know" | "Perfect! And are you both on the same page about potentially selling?" |
| "No" / "They don't know" | "Would they be open to discussing it, or is this something you'd want to talk to them about first?" |
| "They're here" / "They're listening" | "Oh great! Hi there! I'm {agentName} - glad you're both on the call." |

**If co-owner is present:**
```javascript
callContext.keyInfo.coOwnerPresent = true;
```
```
"I'm {CONFIG.agentName} with {CONFIG.companyName}. I was just telling {lead.firstName} that we buy land in {lead.county} and wanted to see if you'd both be interested in hearing an offer. Is that something you'd both be open to?"
```

**If co-owner needs to be consulted:**
```
"That makes total sense - it's a big decision. Would it be better if I called back when you've had a chance to chat about it?"
```
→ May transition to `P1_RESCHEDULE` or continue if seller wants to hear more first

**Transition:**
→ `P1_INTEREST_PROBE` (if aligned)
→ `P1_RESCHEDULE` (if need to consult co-owner)

---

## STATE: P1_FIND_OWNER

**Purpose:** Try to get contact info for actual owner

**Entry Condition:** Speaking to wrong person

**Agent Says:**
```
"Oh, I apologize for the confusion. Do you happen to know who owns the property now, or how I might reach them?"
```

**[WAIT FOR RESPONSE]**

**Detection:**

| Response | Action |
|----------|--------|
| Gives name/number | Capture new lead info |
| "I don't know" | Thank and end call |
| "They moved" / "Sold it" | Ask if they know who bought it |

**If new contact info provided:**
```
"That's really helpful, thank you! I'll reach out to them. Have a great day!"

[ACTION: Create new lead with provided info]
await triggerWebhook("create_lead", {
  sourceLeadId: callContext.lead.id,
  newContactInfo: extractedContactInfo,
  propertyId: callContext.lead.propertyId,
  notes: "Referral from wrong number contact"
});
```

**Transition:**
→ `END_WRONG_NUMBER`

---

## STATE: P1_CLARIFY_PROPERTY

**Purpose:** Clarify which property when seller owns multiple

**Entry Condition:** Seller said "which property?" / "I own several"

**Agent Says:**
```
"My apologies! I'm specifically calling about the {lead.acreage} acres in {lead.county}. The property records show an address of {lead.propertyAddress}. Does that ring a bell?"
```

**[WAIT FOR RESPONSE]**

**If confirmed:**
→ `P1_INTEREST_PROBE`

**If still confused:**
```
"Let me double-check my records. I have it listed under parcel number {lead.apn}. That might help narrow it down."
```

**If they have multiple and are interested:**
```
"Oh, you have multiple properties? We'd potentially be interested in more than one. Would you like to discuss all of them?"

[Note: This could be a larger opportunity]
callContext.flags.push("MULTIPLE_PROPERTIES");
```

---

## STATE: P1_INTEREST_PROBE

**Purpose:** Gauge interest level and qualify the lead

**Entry Condition:** Ownership confirmed, ready to probe interest

**Agent Says:**
```
"Great! Well, I'll be straightforward with you - we buy properties in {lead.county} and I'm calling to see if you'd consider an offer on your {lead.acreage} acres if the price was right?"
```

**[CRITICAL: After this question, STOP TALKING. Wait for their response. Silence is powerful here. Wait up to 8 seconds.]**

**Detection Patterns:**

```javascript
const INTEREST_PROBE_PATTERNS = {
  
  // ═══════════════════════════════════════════════════════════════
  // HOT INTEREST - Strong buying signals
  // ═══════════════════════════════════════════════════════════════
  HOT_INTEREST: {
    patterns: [
      "yes", "definitely", "absolutely", 
      "I've been thinking about selling",
      "I've been wanting to sell",
      "I want to sell",
      "I need to sell",
      "how much", "what's your offer", "what would you pay",
      "make me an offer", "let's hear it",
      "I'm ready", "I'm interested"
    ],
    interestLevel: 2,
    nextState: "ESCALATION_CHECK"
  },
  
  // ═══════════════════════════════════════════════════════════════
  // WARM INTEREST - Conditional or curious
  // ═══════════════════════════════════════════════════════════════
  WARM_INTEREST: {
    patterns: [
      "maybe", "possibly", "depends", "depends on the price",
      "I might", "I could consider", "tell me more",
      "what did you have in mind", "I'm listening",
      "for the right price"
    ],
    interestLevel: 1,
    nextState: "P1_QUALIFYING"
  },
  
  // ═══════════════════════════════════════════════════════════════
  // LUKEWARM - Uncertain
  // ═══════════════════════════════════════════════════════════════
  LUKEWARM: {
    patterns: [
      "I don't know", "not sure", "haven't thought about it",
      "never considered it", "hmm"
    ],
    interestLevel: 0,
    nextState: "P1_LUKEWARM_PROBE"
  },
  
  // ═══════════════════════════════════════════════════════════════
  // SOFT NO - Resistance but not firm
  // ═══════════════════════════════════════════════════════════════
  SOFT_NO: {
    patterns: [
      "probably not", "I don't think so", "not really",
      "not right now", "not at this time"
    ],
    interestLevel: -1,
    nextState: "P1_SOFT_OBJECTION"
  },
  
  // ═══════════════════════════════════════════════════════════════
  // HARD NO - Firm rejection
  // ═══════════════════════════════════════════════════════════════
  HARD_NO: {
    patterns: [
      "no", "not interested", "never", "absolutely not",
      "no way", "not for sale"
    ],
    interestLevel: -2,
    nextState: "P1_HARD_OBJECTION"
  },
  
  // ═══════════════════════════════════════════════════════════════
  // PRICE ANCHORING - They want a number first
  // ═══════════════════════════════════════════════════════════════
  PRICE_FIRST: {
    patterns: [
      "how much are you offering",
      "what's your offer",
      "give me a number",
      "what would you pay",
      "how much per acre"
    ],
    interestLevel: 1,
    nextState: "P1_HANDLE_PRICE_REQUEST"
  }
};
```

**Update context based on response:**
```javascript
function processInterestProbeResponse(response, intent) {
  // Update interest level
  callContext.interestLevel = INTEREST_PROBE_PATTERNS[intent].interestLevel;
  
  // Store response for reference
  callContext.keyInfo.initialInterestResponse = response;
  callContext.keyInfo.initialInterestLevel = intent;
  
  // Check for hot triggers
  if (intent === "HOT_INTEREST") {
    callContext.flags.push("HOT_TRIGGER_DETECTED");
  }
  
  return INTEREST_PROBE_PATTERNS[intent].nextState;
}
```

---

## STATE: P1_LUKEWARM_PROBE

**Purpose:** Convert lukewarm interest into engagement

**Entry Condition:** Seller said "I don't know" / "haven't thought about it"

**Agent Says:**
```
"That's fair - most people haven't really thought about it until someone asks. Let me ask you this: if someone made you a cash offer that was too good to refuse, would you at least listen to what they had to say?"
```

**[WAIT FOR RESPONSE]**

**Detection:**

| Response | Next State |
|----------|------------|
| "I guess so" / "Sure" / "Maybe" | `P1_QUALIFYING` |
| "No" | `P1_SOFT_OBJECTION` |
| Asks about price | `P1_HANDLE_PRICE_REQUEST` |

**If YES/MAYBE:**
```
"Great! Well, that's exactly why I'm calling. Let me ask you a few quick questions so I can give you the most accurate picture of what your property might be worth to us."
```
→ `P1_QUALIFYING`

---

## STATE: P1_HANDLE_PRICE_REQUEST

**Purpose:** Handle seller asking for price before qualifying

**Entry Condition:** Seller asked "how much?" / "what's your offer?"

**Strategy:** Deflect to qualifying questions first, but don't be evasive

**Agent Says:**
```
"That's exactly what I want to talk to you about! I want to give you an accurate number, not just throw something out there. Can I ask you just a couple quick questions about the property first? It'll help me give you our best offer."
```

**[WAIT FOR RESPONSE]**

**Detection:**

| Response | Action |
|----------|--------|
| "Sure" / "Okay" / "Go ahead" | → `P1_QUALIFYING` |
| "Just give me a number" / insistent | → `P1_GIVE_RANGE` |
| "I don't have time for questions" | → `P1_GIVE_RANGE` |

**If insistent on price (P1_GIVE_RANGE):**
```
"I totally understand you want to cut to the chase. Based on what I'm seeing for properties like yours in {lead.county}, investors are typically paying somewhere in the range of {lead.pricing.lowOffer} to {lead.pricing.highOffer} for {lead.acreage} acres. Does that range sound like something worth discussing further?"
```

**[WAIT FOR RESPONSE]**

**Detection after giving range:**

| Response | Next State |
|----------|------------|
| "That could work" / Interest | `ESCALATION_CHECK` or `P1_QUALIFYING` |
| "Too low" / Rejects | `P1_SOFT_OBJECTION` (discuss expectations) |
| Gives counter price | Capture price expectation, → `P1_QUALIFYING` |

---

## STATE: P1_QUALIFYING

**Purpose:** Gather key information to qualify the lead

**Entry Condition:** Seller showed interest, ready to answer questions

**Preamble:**
```
"Great! Let me ask you a few quick questions so I can get you the most accurate information."
```

### QUALIFYING QUESTIONS SEQUENCE

**Question 1: Ownership Duration**
```
"How long have you owned the property?"
```

**[WAIT FOR RESPONSE]**

**Capture & Follow-up:**
```javascript
callContext.keyInfo.ownershipYears = extractYears(response);

// Adaptive follow-up
if (ownershipYears > 10) {
  followUp = "Wow, that's a while! What made you hold onto it for so long?";
} else if (ownershipYears < 2) {
  followUp = "Oh, relatively recent. What were your original plans for it?";
} else {
  followUp = "Got it. And have you used it for anything, or has it just been sitting?";
}
```

**[LISTEN FOR MOTIVATION CLUES]**
Watch for: inheritance, divorce, financial issues, abandoned plans

---

**Question 2: Decision Makers**
```
"Are you the only decision maker on this, or would anyone else need to be involved?"
```

**[WAIT FOR RESPONSE]**

**Capture:**
```javascript
if (indicatesSoleDecision(response)) {
  callContext.keyInfo.decisionMaker = true;
  callContext.keyInfo.hasCoOwner = false;
} else {
  callContext.keyInfo.decisionMaker = false;
  // Extract who else
  callContext.keyInfo.coOwnerName = extractName(response);
  callContext.keyInfo.coOwnerRelation = extractRelation(response);
}
```

**If co-owner mentioned:**
```
"Got it. And is {coOwner} on the same page about potentially selling?"
```

---

**Question 3: Other Offers**
```
"Have you received any other offers on the property recently?"
```

**[WAIT FOR RESPONSE]**

**Capture & Follow-up:**
```javascript
callContext.keyInfo.hasOtherOffers = detectOtherOffers(response);

if (hasOtherOffers) {
  callContext.keyInfo.otherOfferDetails = response;
  speak("Interesting! If you don't mind me asking, why didn't you take any of those offers?");
  // This reveals what's important to them
}
```

**If had offers but didn't take:**
Capture the reason - it tells you what matters:
- "Price wasn't high enough" → They have a number in mind
- "Didn't trust them" → Trust is important, build rapport
- "Timing wasn't right" → Ask about current timing
- "Wife/husband didn't agree" → Co-owner alignment issue

---

**Question 4: Timeline**
```
"If we could agree on a price, what kind of timeline are you looking at to close?"
```

**[WAIT FOR RESPONSE]**

**Capture:**
```javascript
const timelineMap = {
  "asap": "URGENT",
  "right away": "URGENT",
  "quickly": "URGENT",
  "as soon as possible": "URGENT",
  "30 days": "FAST",
  "month": "FAST",
  "60 days": "MODERATE",
  "90 days": "MODERATE",
  "no rush": "FLEXIBLE",
  "whenever": "FLEXIBLE",
  "doesn't matter": "FLEXIBLE"
};

callContext.keyInfo.timeline = mapTimeline(response);
```

**If urgent, probe:**
```
"Got it, sooner rather than later. Is there something driving that timeline?"
```
[This often reveals motivation: needing money, divorce deadline, tax situation, etc.]

---

**Question 5: Price Expectation (CRITICAL)**
```
"Have you thought about what you'd want for the property?"
```

**[WAIT FOR RESPONSE]**

**Capture:**
```javascript
const price = extractPrice(response);

if (price) {
  callContext.keyInfo.priceExpectation = price;
  // Follow up on how they arrived at that number
  speak("Okay, {price}. How did you arrive at that number?");
} else if (indicatesNoIdea(response)) {
  callContext.keyInfo.priceExpectation = null;
  speak("No worries, that's actually pretty common. That's exactly what we can help with - figuring out what it's worth to a cash buyer.");
}
```

**Responses to "how did you arrive at that":**
- "Tax assessment" → Often lower than market
- "Neighbor sold for X" → Comp reference, may be valid
- "What I paid plus..." → Emotional attachment
- "Just a number" → Room to negotiate
- "That's what I need" → Find out why they need that amount

---

### CALCULATE QUALIFICATION SCORE

```javascript
function calculateQualificationScore() {
  let score = 0;
  const info = callContext.keyInfo;
  
  // Interest level (max 30)
  score += (callContext.interestLevel + 2) * 10; // -2 to +2 becomes 0-40, cap at 30
  score = Math.min(score, 30);
  
  // Sole decision maker (10)
  if (info.decisionMaker) score += 10;
  
  // No competing offers (5)
  if (!info.hasOtherOffers) score += 5;
  
  // Timeline (max 15)
  if (info.timeline === "URGENT") score += 15;
  else if (info.timeline === "FAST") score += 12;
  else if (info.timeline === "MODERATE") score += 8;
  else if (info.timeline === "FLEXIBLE") score += 5;
  
  // Price expectation alignment (max 20)
  if (info.priceExpectation) {
    const maxOffer = callContext.lead.pricing?.maxOffer;
    if (maxOffer) {
      if (info.priceExpectation <= maxOffer * 0.8) score += 20;
      else if (info.priceExpectation <= maxOffer) score += 15;
      else if (info.priceExpectation <= maxOffer * 1.2) score += 10;
      else if (info.priceExpectation <= maxOffer * 1.5) score += 5;
      // Above 1.5x max offer = 0 points
    }
  } else {
    // No price expectation = moderate (they might be flexible)
    score += 10;
  }
  
  // Motivation detected (max 20)
  if (info.motivation) {
    const motivationScores = {
      "FINANCIAL": 20,
      "DIVORCE": 20,
      "INHERITED": 18,
      "TAX_BURDEN": 15,
      "RELOCATION": 12,
      "TIRED": 10,
      "OPPORTUNISTIC": 5
    };
    score += motivationScores[info.motivation] || 5;
  }
  
  callContext.qualificationScore = Math.min(score, 100);
  return callContext.qualificationScore;
}
```

**Transition After Qualifying:**
```javascript
const score = calculateQualificationScore();

if (callContext.interestLevel >= 2) {
  // Hot interest - check for escalation
  return "ESCALATION_CHECK";
} else if (score >= 60) {
  // Good qualification - check for escalation
  return "ESCALATION_CHECK";
} else if (score >= 30) {
  // Moderate - book appointment
  return "P1_APPOINTMENT_PITCH";
} else {
  // Low - still try appointment but lower priority
  return "P1_APPOINTMENT_PITCH";
}
```

---

## STATE: P1_APPOINTMENT_PITCH

**Purpose:** Book appointment with acquisition manager

**Entry Condition:** Qualified lead, not escalating (or escalation not available)

**Generate Appointment Options:**
```javascript
function generateAppointmentSlots() {
  const now = new Date();
  const slots = [];
  let daysChecked = 0;
  
  while (slots.length < 2 && daysChecked < 7) {
    const date = addDays(now, daysChecked + 1);
    
    // Skip weekends
    if (date.getDay() !== 0 && date.getDay() !== 6) {
      // Offer morning and afternoon
      if (slots.length === 0) {
        slots.push({ date, time: "10:00 AM" });
      } else {
        slots.push({ date, time: "2:00 PM" });
      }
    }
    daysChecked++;
  }
  
  return slots;
}

const appointmentSlots = generateAppointmentSlots();
```

**Agent Says:**
```
"This sounds like something my acquisition manager, {CONFIG.acquisitionManager.name}, would definitely want to discuss with you. {He/She} handles all our offers and can answer any questions about the process.

I have two times available this week:
- {slot1.dayName} at {slot1.time}
- {slot2.dayName} at {slot2.time}

Which works better for you?"
```

**[WAIT FOR RESPONSE]**

**Detection:**

| Response | Action |
|----------|--------|
| Accepts slot 1 | Book slot 1 |
| Accepts slot 2 | Book slot 2 |
| "Neither works" | Ask for preferred time |
| Asks about price | Handle price objection |
| "I need to think about it" | Handle objection |
| "Just tell me the offer" | Handle price objection |

**If seller picks a slot:**
```javascript
callContext.appointment.dateTime = selectedSlot;
callContext.appointment.with = CONFIG.acquisitionManager.name;
```
→ `P1_COLLECT_EMAIL`

**If neither works:**
```
"No problem! What day and time generally works best for you?"
```
[WAIT FOR RESPONSE]
[Extract their preference]
```
"Perfect! Let me see... yes, I can do {their_preferred_time}. That work?"
```
→ `P1_COLLECT_EMAIL`

**If "Just tell me the price" (P1_PRICE_OBJECTION):**
```
"I completely understand you want to know the price! That's exactly what {AM.name} will go over with you. {He/She} needs to ask a few more questions about the property to give you our best offer. It's a quick call - about 15-20 minutes. Would {slot1} work?"
```

**If "I need to think about it":**
```
"Of course! How about this - I'll have {AM.name} give you a call just to introduce {himself/herself} and answer any questions. No pressure at all. Even if you're just curious about your property's value, it's worth a quick chat. How's {slot1}?"
```

---

## STATE: P1_COLLECT_EMAIL

**Purpose:** Get email address for calendar invite

**Entry Condition:** Appointment time agreed

**Agent Says:**
```
"Perfect! I'll send you a calendar invite so you have all the details. What's the best email address for you?"
```

**[WAIT FOR RESPONSE]**

**Detection:**

| Response | Action |
|----------|--------|
| Gives email | Capture and confirm |
| Hesitates / "Why do you need that" | Explain purpose |
| "I don't have email" | Offer SMS reminder |
| Gives email but unclear | Spell back to confirm |

**If gives email:**
```javascript
callContext.appointment.email = extractEmail(response);
```
```
"Great! Let me make sure I have that right - {spell_out_email}. Is that correct?"
```
[WAIT FOR CONFIRMATION]
→ `P1_CONFIRM_APPOINTMENT`

**If hesitates:**
```
"It's just so you get the calendar reminder with our phone number and all the details. That way you won't miss the call. What email do you check most often?"
```

**If no email:**
```
"No problem at all! I can text you a reminder instead. Is this the best number to text - {lead.phone}?"
```
```javascript
callContext.appointment.reminderMethod = "SMS";
```
→ `P1_CONFIRM_APPOINTMENT`

---

## STATE: P1_CONFIRM_APPOINTMENT

**Purpose:** Confirm all appointment details and close the call

**Entry Condition:** Email or SMS reminder method established

**Agent Says:**
```
"Perfect! So I have you scheduled with {AM.name} on {appointment.dayName} at {appointment.time}.

{He/She}'ll be calling you at this number - {lead.phone} - is that the best number to reach you?"
```
[WAIT FOR CONFIRMATION]

```
"Great! And I'll send that calendar invite to {appointment.email} right after we hang up.

Just so you know, {AM.name} will ask you some questions about the property and then make you a fair cash offer. The whole call takes about 15-20 minutes.

Do you have any questions before then?"
```

**[WAIT FOR RESPONSE]**

**Handle any questions briefly, then close:**
```
"Sounds good! {AM.name} is looking forward to chatting with you. Have a great {time_of_day}, {lead.firstName}!"
```

**POST-CALL ACTIONS:**
```javascript
// 1. Send calendar invite
await triggerWebhook("create_calendar_event", {
  title: `Property Discussion - ${callContext.lead.propertyAddress}`,
  dateTime: callContext.appointment.dateTime,
  attendeeEmail: callContext.appointment.email,
  attendeeName: callContext.lead.fullName,
  attendeePhone: callContext.lead.phone,
  description: `
    Property: ${callContext.lead.propertyAddress}
    Acreage: ${callContext.lead.acreage}
    Phone: ${callContext.lead.phone}
    
    Notes: ${JSON.stringify(callContext.keyInfo)}
  `,
  location: `Phone Call to ${callContext.lead.phone}`
});

// 2. Send confirmation SMS (if opted for SMS)
if (callContext.appointment.reminderMethod === "SMS") {
  await triggerWebhook("send_sms", {
    to: callContext.lead.phone,
    message: `Hi ${callContext.lead.firstName}, this is ${CONFIG.agentName} with ${CONFIG.companyName}. Just confirming your appointment for ${formatDate(callContext.appointment.dateTime)}. ${CONFIG.acquisitionManager.name} will call you at that time!`
  });
}

// 3. Update CRM
await triggerWebhook("update_lead", {
  leadId: callContext.lead.id,
  status: "appointment_scheduled",
  appointmentTime: callContext.appointment.dateTime,
  appointmentWith: CONFIG.acquisitionManager.name,
  qualificationScore: callContext.qualificationScore,
  keyInfo: callContext.keyInfo,
  callRecordingUrl: callContext.recordingUrl
});

// 4. Notify acquisition manager
await triggerWebhook("slack_notification", {
  channel: "#appointments",
  message: `📅 NEW APPOINTMENT
Seller: ${callContext.lead.fullName}
Property: ${callContext.lead.propertyAddress} (${callContext.lead.acreage} acres)
Time: ${formatDate(callContext.appointment.dateTime)}
Score: ${callContext.qualificationScore}/100
Interest: ${getInterestLabel(callContext.interestLevel)}
Notes: ${summarizeKeyInfo(callContext.keyInfo)}
Recording: ${callContext.recordingUrl}`
});
```

**Transition:**
→ `END_APPOINTMENT_SET`

---

*[CONTINUED IN PART 2: Escalation Decision Engine + Phase 2 Acquisition States]*
# LandVerse AI Agent - Complete Call Flow Specification
## PART 2: Escalation Decision Engine + Phase 2 Acquisition

---

# 4. ESCALATION DECISION ENGINE

## STATE: ESCALATION_CHECK

**Purpose:** Determine whether to escalate to full acquisition (Phase 2) or book appointment

**Entry Condition:** Hot interest detected OR high qualification score

### ESCALATION DECISION LOGIC

```javascript
const ESCALATION_CONFIG = {
  
  // ═══════════════════════════════════════════════════════════════════
  // GATE 1: AGENT MODE
  // ═══════════════════════════════════════════════════════════════════
  // Only SOLO mode agents can escalate. TEAM mode always books appointments.
  
  allowedModes: ["SOLO"],
  
  // ═══════════════════════════════════════════════════════════════════
  // GATE 2: PRICING AVAILABILITY
  // ═══════════════════════════════════════════════════════════════════
  // Cannot escalate without pricing data
  
  requiresPricing: true,
  
  // ═══════════════════════════════════════════════════════════════════
  // GATE 3: HOT TRIGGER PHRASES (Required - at least one)
  // ═══════════════════════════════════════════════════════════════════
  
  hotTriggerPhrases: [
    // Direct intent to sell
    { phrase: "i've been thinking about selling", weight: 40 },
    { phrase: "i want to sell", weight: 40 },
    { phrase: "i've been wanting to sell", weight: 40 },
    { phrase: "i need to sell", weight: 45 },
    { phrase: "i'm ready to sell", weight: 45 },
    { phrase: "yes i'd sell", weight: 40 },
    { phrase: "i would sell", weight: 35 },
    { phrase: "looking to sell", weight: 40 },
    { phrase: "trying to sell", weight: 40 },
    
    // Price inquiry (strong buying signal)
    { phrase: "how much would you offer", weight: 40 },
    { phrase: "what would you pay", weight: 40 },
    { phrase: "what's your offer", weight: 40 },
    { phrase: "what are you offering", weight: 35 },
    { phrase: "make me an offer", weight: 45 },
    { phrase: "give me a number", weight: 35 },
    
    // Conditional but hot
    { phrase: "might be interested if the price is right", weight: 35 },
    { phrase: "depends on the price", weight: 30 },
    { phrase: "depends on the offer", weight: 30 },
    { phrase: "for the right price", weight: 35 }
  ],
  
  // ═══════════════════════════════════════════════════════════════════
  // GATE 4: MOTIVATION INDICATORS (Strengthen confidence)
  // ═══════════════════════════════════════════════════════════════════
  
  motivationIndicators: {
    FINANCIAL_HARDSHIP: {
      weight: 25,
      phrases: [
        "need the money", "need cash", "financial trouble",
        "struggling", "behind on", "can't afford", "debt",
        "bills", "foreclosure", "bankruptcy"
      ]
    },
    DIVORCE: {
      weight: 25,
      phrases: [
        "divorce", "divorced", "divorcing", "splitting up",
        "separated", "ex-wife", "ex-husband", "settlement"
      ]
    },
    DEATH_ESTATE: {
      weight: 22,
      phrases: [
        "inherited", "passed away", "died", "death", "estate",
        "probate", "don't want it", "never wanted it",
        "left to me", "from my parents"
      ]
    },
    TAX_BURDEN: {
      weight: 20,
      phrases: [
        "taxes", "property tax", "tax bill", "expensive to hold",
        "tax lien", "back taxes", "paying taxes on it"
      ]
    },
    RELOCATION: {
      weight: 15,
      phrases: [
        "moving", "moved", "relocated", "out of state",
        "too far", "never go there", "haven't visited"
      ]
    },
    HEALTH: {
      weight: 22,
      phrases: [
        "health", "sick", "hospital", "medical", "surgery",
        "can't maintain", "getting older", "retiring", "age"
      ]
    },
    TIRED: {
      weight: 15,
      phrases: [
        "tired of", "hassle", "headache", "maintenance",
        "brush clearing", "liability", "just sitting there",
        "don't use it"
      ]
    }
  },
  
  // ═══════════════════════════════════════════════════════════════════
  // GATE 5: QUALIFICATION BOOSTERS
  // ═══════════════════════════════════════════════════════════════════
  
  qualificationBoosters: {
    soleDecisionMaker: { weight: 10 },
    noCoOwner: { weight: 8 },
    urgentTimeline: { weight: 12 },
    flexibleTimeline: { weight: 5 },
    noCompetingOffers: { weight: 5 },
    rejectedPriorOffers: { weight: 8 },
    priceInRange: { weight: 15 },
    longOwnership: { weight: 5 },
    outOfState: { weight: 5 }
  },
  
  // ═══════════════════════════════════════════════════════════════════
  // GATE 6: ESCALATION BLOCKERS (Prevents escalation)
  // ═══════════════════════════════════════════════════════════════════
  
  escalationBlockers: [
    "need to talk to my wife",
    "need to talk to my husband",
    "need to ask my partner",
    "need to ask my spouse",
    "need to discuss with",
    "let me think about it",
    "need to think about it",
    "call me back",
    "not a good time",
    "send me information",
    "email me information",
    "i'll call you back",
    "my attorney needs to",
    "my lawyer",
    "my accountant",
    "family decision",
    "need to pray about it",
    "need to sleep on it"
  ],
  
  // ═══════════════════════════════════════════════════════════════════
  // THRESHOLDS
  // ═══════════════════════════════════════════════════════════════════
  
  thresholds: {
    escalate: 70,          // Score >= 70: ESCALATE
    maybeEscalate: 50,     // Score 50-69: ESCALATE with flag
    bookAppointment: 0     // Score < 50: BOOK APPOINTMENT
  }
};
```

### ESCALATION EVALUATION FUNCTION

```javascript
function evaluateEscalation(callContext) {
  const transcript = callContext.transcript.toLowerCase();
  
  const result = {
    shouldEscalate: false,
    confidenceScore: 0,
    reasons: [],
    blockers: [],
    flags: [],
    decision: null
  };
  
  // ═══════════════════════════════════════════════════════════════════
  // GATE 1: Check Agent Mode
  // ═══════════════════════════════════════════════════════════════════
  if (CONFIG.agentMode !== "SOLO") {
    result.decision = "BOOK_APPOINTMENT";
    result.reasons.push("Agent mode is TEAM - escalation not allowed");
    return result;
  }
  
  // ═══════════════════════════════════════════════════════════════════
  // GATE 2: Check Pricing Availability
  // ═══════════════════════════════════════════════════════════════════
  if (!callContext.lead.pricing || !callContext.lead.pricing.maxOffer) {
    result.decision = "BOOK_APPOINTMENT";
    result.reasons.push("No pricing data available - cannot make offers");
    result.flags.push("MISSING_PRICING");
    return result;
  }
  
  // ═══════════════════════════════════════════════════════════════════
  // GATE 3: Check for Blockers FIRST
  // ═══════════════════════════════════════════════════════════════════
  for (const blocker of ESCALATION_CONFIG.escalationBlockers) {
    if (transcript.includes(blocker)) {
      result.blockers.push(blocker);
    }
  }
  
  if (result.blockers.length > 0) {
    result.decision = "BOOK_APPOINTMENT";
    result.reasons.push(`Blocker detected: "${result.blockers[0]}"`);
    return result;
  }
  
  // ═══════════════════════════════════════════════════════════════════
  // GATE 4: Check for Hot Triggers
  // ═══════════════════════════════════════════════════════════════════
  let hotTriggerFound = false;
  let maxTriggerWeight = 0;
  
  for (const trigger of ESCALATION_CONFIG.hotTriggerPhrases) {
    if (transcript.includes(trigger.phrase)) {
      hotTriggerFound = true;
      if (trigger.weight > maxTriggerWeight) {
        maxTriggerWeight = trigger.weight;
        result.reasons.push(`Hot trigger: "${trigger.phrase}" (+${trigger.weight})`);
      }
    }
  }
  
  if (!hotTriggerFound) {
    result.decision = "BOOK_APPOINTMENT";
    result.reasons.push("No hot trigger phrase detected");
    return result;
  }
  
  result.confidenceScore += maxTriggerWeight;
  
  // ═══════════════════════════════════════════════════════════════════
  // GATE 5: Check for Motivation Indicators
  // ═══════════════════════════════════════════════════════════════════
  for (const [motivationType, config] of Object.entries(ESCALATION_CONFIG.motivationIndicators)) {
    for (const phrase of config.phrases) {
      if (transcript.includes(phrase)) {
        result.confidenceScore += config.weight;
        result.reasons.push(`Motivation (${motivationType}): "${phrase}" (+${config.weight})`);
        callContext.keyInfo.motivation = motivationType;
        break; // Only count each motivation type once
      }
    }
  }
  
  // ═══════════════════════════════════════════════════════════════════
  // GATE 6: Apply Qualification Boosters
  // ═══════════════════════════════════════════════════════════════════
  const info = callContext.keyInfo;
  const boosters = ESCALATION_CONFIG.qualificationBoosters;
  
  if (info.decisionMaker) {
    result.confidenceScore += boosters.soleDecisionMaker.weight;
    result.reasons.push(`Booster: Sole decision maker (+${boosters.soleDecisionMaker.weight})`);
  }
  
  if (!info.hasCoOwner) {
    result.confidenceScore += boosters.noCoOwner.weight;
    result.reasons.push(`Booster: No co-owner (+${boosters.noCoOwner.weight})`);
  }
  
  if (info.timeline === "URGENT") {
    result.confidenceScore += boosters.urgentTimeline.weight;
    result.reasons.push(`Booster: Urgent timeline (+${boosters.urgentTimeline.weight})`);
  } else if (info.timeline === "FLEXIBLE") {
    result.confidenceScore += boosters.flexibleTimeline.weight;
  }
  
  if (!info.hasOtherOffers) {
    result.confidenceScore += boosters.noCompetingOffers.weight;
  }
  
  // Check price alignment
  if (info.priceExpectation && callContext.lead.pricing) {
    if (info.priceExpectation <= callContext.lead.pricing.maxOffer) {
      result.confidenceScore += boosters.priceInRange.weight;
      result.reasons.push(`Booster: Price expectation in range (+${boosters.priceInRange.weight})`);
    }
  }
  
  if (callContext.lead.ownershipYears > 10) {
    result.confidenceScore += boosters.longOwnership.weight;
  }
  
  if (callContext.lead.isOutOfState) {
    result.confidenceScore += boosters.outOfState.weight;
  }
  
  // ═══════════════════════════════════════════════════════════════════
  // FINAL DECISION
  // ═══════════════════════════════════════════════════════════════════
  if (result.confidenceScore >= ESCALATION_CONFIG.thresholds.escalate) {
    result.shouldEscalate = true;
    result.decision = "ESCALATE";
    result.reasons.push(`Score ${result.confidenceScore} >= threshold ${ESCALATION_CONFIG.thresholds.escalate}`);
  } else if (result.confidenceScore >= ESCALATION_CONFIG.thresholds.maybeEscalate) {
    result.shouldEscalate = true;
    result.decision = "ESCALATE_WITH_FLAG";
    result.flags.push("MODERATE_CONFIDENCE");
    result.reasons.push(`Score ${result.confidenceScore} in moderate range`);
  } else {
    result.shouldEscalate = false;
    result.decision = "BOOK_APPOINTMENT";
    result.reasons.push(`Score ${result.confidenceScore} below threshold`);
  }
  
  return result;
}
```

### STATE BEHAVIOR

```javascript
// In ESCALATION_CHECK state
const escalationResult = evaluateEscalation(callContext);

// Store result for logging
callContext.escalationResult = escalationResult;

if (escalationResult.shouldEscalate) {
  callContext.escalationAttempted = true;
  return { nextState: "ESCALATION_TRANSITION" };
} else {
  return { nextState: "P1_APPOINTMENT_PITCH" };
}
```

---

## STATE: ESCALATION_TRANSITION

**Purpose:** Transition the call from cold calling to full acquisition

**Entry Condition:** Escalation approved

**Agent Says:**
```
"You know what, {lead.firstName}, it sounds like this might be perfect timing! 

I actually handle acquisitions directly - I'm not just setting appointments. 

Do you have about 10-15 minutes right now? I can go through some details with you and potentially make you an offer today."
```

**[WAIT FOR RESPONSE]**

**Detection:**

```javascript
const ESCALATION_TRANSITION_RESPONSES = {
  
  ACCEPTS: {
    patterns: [
      "yes", "sure", "okay", "yeah", "go ahead",
      "I have time", "that works", "let's do it",
      "I'm listening", "tell me more"
    ],
    nextState: "P2_FRAME_CALL"
  },
  
  CONDITIONAL_YES: {
    patterns: [
      "how long will it take", "will this take long",
      "I have a few minutes", "make it quick"
    ],
    script: "It should only take about 10-15 minutes. I'll make sure we keep it efficient. Does that work?",
    nextState: "WAIT_FOR_CONFIRMATION"
  },
  
  NOT_NOW_BUT_INTERESTED: {
    patterns: [
      "not right now", "bad time", "busy right now",
      "can we do it later", "call me back"
    ],
    script: "No problem at all! When would be a better time? I want to make sure we have enough time to go through everything properly.",
    nextState: "P1_RESCHEDULE",
    flag: "HOT_LEAD_CALLBACK"
  },
  
  CHANGED_MIND: {
    patterns: [
      "I don't think so", "never mind", "I'm not sure",
      "let me think about it"
    ],
    script: "No problem! Would you prefer I just have our acquisition manager give you a call instead? That way you can think about it and be ready with any questions.",
    nextState: "P1_APPOINTMENT_PITCH"
  },
  
  NEEDS_CO_OWNER: {
    patterns: [
      "my wife isn't here", "need my husband",
      "need to talk to", "partner isn't available"
    ],
    script: "That makes total sense - this is a big decision. When would you both be available? I'd love to chat with you together.",
    nextState: "P1_RESCHEDULE",
    flag: "JOINT_CALL_NEEDED"
  }
};
```

**If ACCEPTS:**
```javascript
callContext.callPhase = "ACQUISITION";
callContext.escalatedFromColdCall = true;
callContext.escalationTime = Date.now();
```

**Agent Says:**
```
"Perfect! Let me just confirm a few more details so I can give you the most accurate offer. This should take about 15-20 minutes total. Sound good?"
```

[BRIEF PAUSE]

**Transition:**
→ `P2_FRAME_CALL`

---

# 5. PHASE 2: ACQUISITION

## STATE: P2_FRAME_CALL

**Purpose:** Set expectations for the acquisition conversation

**Entry Condition:** Escalation accepted OR scheduled acquisition call (warm call)

**If Escalated from Cold Call:**
```
"So, I just wanted to confirm a few more details, ask a couple more questions, and then jump into an offer on the property. This should take about 10-15 more minutes. Sound good?"
```

**If Scheduled Warm Call (appointment):**
```
"Hi {lead.firstName}, it's {CONFIG.agentName} with {CONFIG.companyName}. Did I catch you at a bad time?

[WAIT FOR RESPONSE - if bad time, reschedule]

Great! I'm reaching out about your {lead.acreage} acres property in {lead.county}. I believe you spoke with {referringAgentName} recently about it. Do you remember that conversation?

[WAIT FOR CONFIRMATION]

Perfect! So, I just wanted to confirm a few details, ask a couple more questions, and then jump into an offer on the property. This call should take about 15-20 minutes. Is now still a good time for that?"
```

**[WAIT FOR CONFIRMATION]**

**Detection:**

| Response | Action |
|----------|--------|
| "Yes" / "Sounds good" | Continue to P2_PAST_QUESTIONS |
| "How long will this take?" | "About 15-20 minutes total. We'll go through some property details and I'll give you our offer. Does that work?" |
| "Actually I'm busy" | → `P1_RESCHEDULE` |
| "I've changed my mind" | "No problem! Can I ask what changed? Maybe I can address any concerns." |

**Transition:**
→ `P2_PAST_QUESTIONS`

---

## STATE: P2_PAST_QUESTIONS

**Purpose:** Understand the history of the property and emotional connection

**Entry Condition:** Frame set, seller ready to proceed

**Agent Says:**
```
"I see you acquired the property back in {lead.purchaseYear}. Can I ask, what was going on back then? What made you decide to buy it?"
```

**[WAIT FOR RESPONSE]**

**[CRITICAL: Use MIRRORING to go deeper. When seller mentions something interesting, repeat the last few words as a question to encourage elaboration]**

**Mirroring Examples:**
- Seller: "We inherited it from my uncle"
- Agent: "Inherited from your uncle?" [Let them continue]

- Seller: "We were going to build our dream home"
- Agent: "Your dream home?" [Let them continue]

- Seller: "Things just didn't work out"
- Agent: "Didn't work out?" [Let them continue]

**Capture Key Information:**
```javascript
// Listen for and capture:
callContext.keyInfo.acquisitionStory = response;

// Look for emotional content:
// - Family connection (inherited, parents, uncle)
// - Dreams (retirement home, kids' future, investment)
// - Disappointment (never got around to it, plans changed)
```

**Follow-up Question:**
```
"Got it. And what were your original plans for it? Were you going to build on it, or did you have something else in mind?"
```

**[WAIT FOR RESPONSE]**

**Capture:**
```javascript
callContext.keyInfo.originalPlans = response;
```

**Follow-up:**
```
"And did you end up doing that, or did something change along the way?"
```

**[WAIT FOR RESPONSE]**

**[LISTEN FOR MOTIVATION CLUES:]**
- "Life got in the way" → Plans abandoned, may be ready to let go
- "Too expensive to build" → Financial motivation
- "We moved" → Distance/convenience motivation
- "Never got around to it" → Low attachment
- "Health issues" → Urgency/need

**Capture:**
```javascript
callContext.keyInfo.whatChanged = response;

// Detect motivation
const motivationClues = detectMotivation(response);
if (motivationClues) {
  callContext.keyInfo.motivation = motivationClues.type;
  callContext.keyInfo.motivationDetails = motivationClues.details;
}
```

**Transition:**
→ `P2_PRESENT_QUESTIONS`

---

## STATE: P2_PRESENT_QUESTIONS

**Purpose:** Understand current situation and motivation to sell NOW

**Entry Condition:** Past questions complete

**Question 1: Pre-existing Interest**
```
"I know we actually reached out to you, but can I ask - were you considering selling the property before we called?"
```

**[WAIT FOR RESPONSE]**

**Capture & Adapt:**
```javascript
if (indicatesYes(response)) {
  callContext.keyInfo.wasConsideringSelling = true;
  // They were already thinking about it - find out more
  speak("Oh really? How long have you been thinking about it?");
} else {
  callContext.keyInfo.wasConsideringSelling = false;
  // We planted the idea - that's fine
  speak("No worries - that's actually pretty common. Sometimes it takes someone reaching out to get people thinking about it.");
}
```

**Question 2: Duration of Consideration (if applicable)**
```
"How long have you been thinking about selling?"
```

**[WAIT FOR RESPONSE]**

**Capture:**
```javascript
callContext.keyInfo.considerationDuration = extractDuration(response);
```

**Question 3: Trigger Event (CRITICAL)**
```
"Got it. What happened {timeframe} ago that made you start considering selling?"
```

**[WAIT FOR RESPONSE]**

**[THIS IS OFTEN THE MOST IMPORTANT ANSWER - IT REVEALS TRUE MOTIVATION]**

**Capture:**
```javascript
callContext.keyInfo.triggerEvent = response;

// Map to motivation type
const triggerMotivation = mapTriggerToMotivation(response);
if (triggerMotivation) {
  callContext.keyInfo.motivation = triggerMotivation;
}
```

**Co-Owner Check (if applicable):**
```javascript
if (callContext.keyInfo.hasCoOwner) {
  speak(`You mentioned your ${callContext.keyInfo.coOwnerRelation} earlier. Does ${heOrShe} know we're having this conversation?`);
  
  // Wait for response
  
  speak(`And have you two talked about selling? Are you on the same page about price and timeline?`);
  
  // Capture alignment status
}
```

**Question 4: Other Offers**
```
"Have you received any other offers for your property?"
```

**[WAIT FOR RESPONSE]**

**If YES:**
```javascript
callContext.keyInfo.hasOtherOffers = true;
callContext.keyInfo.otherOfferDetails = response;
```
```
"If you don't mind me asking... why didn't you take any of them?"
```

**[WAIT FOR RESPONSE]**

**[CRITICAL: This tells you what matters to them]**

```
"Got it, so {their_reason}. Is that a big deal or a little deal for you?"
```

**Capture:**
```javascript
callContext.keyInfo.whyRejectedOffers = response;
callContext.keyInfo.importanceOfRejectionReason = response; // big or little deal
```

**Transition:**
→ `P2_FUTURE_QUESTIONS`

---

## STATE: P2_FUTURE_QUESTIONS

**Purpose:** Paint a vision of life after selling, create emotional investment

**Entry Condition:** Present questions complete

**Select Question Based on Context:**
```javascript
function selectFutureQuestion() {
  const motivation = callContext.keyInfo.motivation;
  
  switch(motivation) {
    case "FINANCIAL_HARDSHIP":
      return "If you were able to get this property sold and have that cash in hand, what would that do for your situation right now?";
    
    case "DIVORCE":
      return "Once this property is settled, what's the next chapter look like for you?";
    
    case "DEATH_ESTATE":
      return "Once you've got this taken care of, how will it feel to have it off your plate?";
    
    case "RELOCATION":
      return "With this property handled, you'll really be fully settled in {newLocation}. How does that feel to think about?";
    
    case "TAX_BURDEN":
      return "Imagine not having that tax bill coming every year. What would you do with that money instead?";
    
    case "HEALTH":
      return "If you didn't have to worry about this property anymore, how would that help with everything else you're dealing with?";
    
    case "TIRED":
      return "Once this is off your hands, what are you going to do with that mental space?";
    
    default:
      return "If we could get this done, what would that do for you and your family?";
  }
}
```

**Agent Says:**
```
"{selectedFutureQuestion}"
```

**[WAIT FOR RESPONSE]**

**[CAPTURE THEIR VISION - This becomes powerful leverage in negotiation]**

```javascript
callContext.keyInfo.sellerVision = response;
callContext.keyInfo.emotionalAnchor = extractEmotionalAnchor(response);

// Examples of emotional anchors:
// "I could finally pay off my credit cards"
// "We could take that vacation we've been putting off"
// "I could stop worrying about it"
// "My kids wouldn't have to deal with it"
// "I could focus on my health"
```

**Reinforce the Vision:**
```
"That sounds really important. Getting this sold could really help make that happen."
```

**Transition:**
→ `P2_DEAL_KILLERS`

---

## STATE: P2_DEAL_KILLERS

**Purpose:** Identify and eliminate potential blockers BEFORE discussing price

**Entry Condition:** Future questions complete

### DEAL KILLER 1: Partner/Spouse Alignment

**Agent Says:**
```
"If we were to reach an agreement today, would anybody else need to sign off before we could move forward?"
```

**[WAIT FOR RESPONSE]**

**Detection & Handling:**

| Response | Action |
|----------|--------|
| "No, just me" / "I make the decisions" | Good - continue |
| "My wife/husband would need to agree" | Address co-owner situation |
| "My kids" / "Family" | Understand family dynamics |
| "My attorney" | Note - may slow process |

**If co-owner needs to agree:**
```
"That makes sense. Is {coOwner} available to join us now, or should we schedule a time when you're both free?"
```

| Response | Action |
|----------|--------|
| "They're here" / "I can get them" | Wait for co-owner, include in conversation |
| "They're not available" | "When would be a good time for all of us to chat?" → May need to reschedule |
| "They'll go along with whatever I decide" | Confirm: "So if you and I agree on a price, they'll be on board?" |

**If needs family approval:**
```
"Got it. Is there one person in the family who kind of takes the lead on these decisions?"
```

### DEAL KILLER 2: Timing/Readiness

**Agent Says:**
```
"If we were to reach an agreement today, would anything prevent you from selling the property in the next 90 days?"
```

**[WAIT FOR RESPONSE]**

**Detection & Handling:**

| Response | Action |
|----------|--------|
| "No, I'm ready" / "Nothing" | Good - continue |
| "I need to do X first" | Understand the blocker |
| "I'm not in a rush" | Note - may prefer longer timeline |

**If there's a blocker:**
```
"What would need to happen before you could move forward?"
```

**[WAIT FOR RESPONSE]**

```
"And how long do you think that would take?"
```

**[WAIT FOR RESPONSE]**

**If blocker is minor:**
```
"Would it be totally ridiculous if I offered to help with that? Sometimes we can work with sellers to clear small hurdles."
```

**Capture:**
```javascript
callContext.keyInfo.timingBlocker = response;
callContext.keyInfo.blockerResolution = null; // or captured resolution
```

### DEAL KILLER 3: Certainty/Trust

**[This is built implicitly through the conversation, but can be addressed directly if seller seems uncertain]**

**If seller expresses uncertainty:**
```
"I want to make sure you're comfortable with this process. What questions do you have about how this would work?"
```

**Walk through process to build certainty:**
```
"Let me explain exactly what happens if we move forward:

First, we'll agree on a price today.
Then, I'll send you a simple one-page agreement.
From there, a title company handles all the legal transfer.
They make sure there are no liens or issues.
We wire the money, and they wire it to you.
You don't transfer ownership until you have the money.

Does that make sense?"
```

**Transition:**
→ `P2_PITCH`

---

## STATE: P2_PITCH

**Purpose:** Explain how the company works, build confidence

**Entry Condition:** Deal killers addressed

**Agent Says:**
```
"Okay, I think I have a good picture of your situation. Did {referring_agent} share how our company works, or should I break that down for you real quick?"
```

**[WAIT FOR RESPONSE]**

**If needs explanation (or always give abbreviated version):**
```
"Well, at {CONFIG.companyName}, we pride ourselves on easy transactions and extraordinary service - we try to make selling as painless as possible.

Here's how it works:
- We don't charge any commissions - you keep everything
- We pay cash for all our properties
- Our agreements are simple - typically just one page
- We can close in as little as 30 days, or work with your timeline
- We only use reputable title companies for everything

The whole process is designed to be easy for you. Do you have any questions about that?"
```

**[WAIT FOR RESPONSE]**

**Handle Common Questions:**

| Question | Response |
|----------|----------|
| "How do you make money?" | "Great question! We make our profit when we resell the property. We buy at a price that works for both of us, and then we either hold it as an investment or sell it to another buyer. Win-win." |
| "Is this legit?" | "Absolutely! We've been doing this for {years} years and have bought hundreds of properties. We use licensed title companies for every transaction - they protect both of us. I can share references if you'd like." |
| "Why not use a realtor?" | "You definitely could! But that typically means 6% in commissions, months of showings, and no guarantee. We offer a guaranteed cash sale with a known closing date. A lot of sellers prefer the simplicity and certainty." |
| "What if something goes wrong?" | "Great question. The title company does a full title search to catch any issues. If something comes up, we work through it together. You're protected throughout the entire process." |

**Transition:**
→ `P2_OFFER_TRANSITION`

---

## STATE: P2_OFFER_TRANSITION

**Purpose:** Present the offer range using blame-shift technique

**Entry Condition:** Pitch complete

**[STRATEGY: "Blame shift" - Instead of "I'll offer you X", we say "investors are paying X-Y" to shift blame to the market and create negotiating room]**

**Deliver State Disclosure (if required):**
```javascript
const disclosure = STATE_DISCLOSURES[callContext.lead.state];
if (disclosure?.required && disclosure.timing === "before_offer") {
  speak(disclosure.disclosure);
}
```

**Calculate Offer Range:**
```javascript
const pricing = callContext.lead.pricing;
const lowOffer = formatCurrency(pricing.lowOffer);
const highOffer = formatCurrency(pricing.targetOffer); // Use target as high for range
```

**Agent Says:**
```
"So for {lead.acreage} acres in {lead.county} with a {timeline} closing timeframe, we're seeing other investors are paying around {lowOffer} to {highOffer} for properties like this.

What would you say if one of those investors made an offer in that range?"
```

**[CRITICAL: STOP TALKING. DO NOT SPEAK UNTIL SELLER RESPONDS. SILENCE IS YOUR FRIEND. WAIT UP TO 10 SECONDS.]**

**Detection:**

```javascript
const OFFER_RESPONSE_PATTERNS = {
  
  ACCEPTS_RANGE: {
    patterns: [
      "that could work", "that sounds okay", "sounds reasonable",
      "I could do that", "that's in the ballpark", "maybe",
      "I'd consider that"
    ],
    nextState: "P2_NARROW_OFFER"
  },
  
  WANTS_HIGHER: {
    patterns: [
      "I was thinking more", "I need more than that",
      "that's too low", "I want", "I was hoping for",
      "can you do better", "that's not enough"
    ],
    nextState: "P2_HANDLE_COUNTER"
  },
  
  WAY_TOO_LOW: {
    patterns: [
      "that's insulting", "ridiculous", "no way",
      "are you kidding", "that's a joke", "way too low",
      "not even close"
    ],
    nextState: "P2_HANDLE_REJECTION"
  },
  
  ASKS_SPECIFIC: {
    patterns: [
      "what exactly", "what's your specific offer",
      "give me a number", "which is it"
    ],
    nextState: "P2_GIVE_SPECIFIC"
  },
  
  NEEDS_TO_THINK: {
    patterns: [
      "let me think", "I don't know", "need to consider",
      "that's a lot to think about"
    ],
    nextState: "P2_HANDLE_HESITATION"
  },
  
  GIVES_COUNTER: {
    patterns: [
      // Contains dollar amount or number
      "I want", "I need", "I was thinking", "my number is"
    ],
    detect: (response) => extractPrice(response) !== null,
    nextState: "P2_HANDLE_COUNTER"
  }
};
```

---

## STATE: P2_NARROW_OFFER

**Purpose:** Narrow from range to specific offer

**Entry Condition:** Seller accepted the general range

**Agent Says:**
```
"Great! It does look like our offer would be closer to that {lowOffer} number. What do you think about that?"
```

**[WAIT FOR RESPONSE]**

**Detection:**

| Response | Next State |
|----------|------------|
| Accepts | `P2_CONFIRM_AGREEMENT` |
| Wants more | `P2_NEGOTIATION` |
| Needs to think | `P2_HANDLE_HESITATION` |

---

## STATE: P2_GIVE_SPECIFIC

**Purpose:** Give specific number when asked

**Entry Condition:** Seller asked for specific offer

**Agent Says:**
```
"Based on what I'm seeing for properties like yours, our offer would be {pricing.lowOffer}. How does that sound?"
```

**[WAIT FOR RESPONSE]**

**Transition:**
→ Based on response, `P2_CONFIRM_AGREEMENT` or `P2_NEGOTIATION`

---

## STATE: P2_HANDLE_COUNTER

**Purpose:** Handle seller's counter-offer or price expectation

**Entry Condition:** Seller gave a number or said "too low"

**Extract their price:**
```javascript
const sellerPrice = extractPrice(response);
callContext.keyInfo.sellerCounterOffer = sellerPrice;
```

**Agent Says:**
```
"Okay, {sellerPrice}. Help me understand - how did you arrive at that number?"
```

**[WAIT FOR RESPONSE]**

**[LISTEN FOR: tax assessment, neighbor's sale, what they paid, what they need, arbitrary]**

**Capture reasoning:**
```javascript
callContext.keyInfo.priceReasoning = response;
```

**Transition:**
→ `P2_NEGOTIATION`

---

## STATE: P2_HANDLE_REJECTION

**Purpose:** Handle when offer is rejected as too low

**Entry Condition:** Seller said offer was "insulting" or "ridiculous"

**Agent Says:**
```
"I hear you - I know that might be lower than you were hoping. Can I ask what number you had in mind?"
```

**[WAIT FOR RESPONSE]**

**Capture:**
```javascript
const sellerPrice = extractPrice(response);
callContext.keyInfo.sellerCounterOffer = sellerPrice;
```

**Assess gap:**
```javascript
const gap = sellerPrice - callContext.lead.pricing.maxOffer;
const gapPercent = gap / callContext.lead.pricing.maxOffer;
```

**If gap is closeable (< 30% above max):**
→ `P2_NEGOTIATION`

**If gap is huge (> 50% above max):**
```
"I appreciate you sharing that. Honestly, based on what properties are actually selling for in {county}, {sellerPrice} is quite a bit higher than what investors are paying right now. 

What would happen if you didn't get that price?"
```

**[WAIT FOR RESPONSE - looking for flexibility or firm stance]**

---

## STATE: P2_HANDLE_HESITATION

**Purpose:** Handle seller who needs to think

**Entry Condition:** Seller said "let me think about it"

**Agent Says:**
```
"I totally understand - it's a big decision. Can I ask what specifically you're thinking through? Maybe I can help address it."
```

**[WAIT FOR RESPONSE]**

**Common hesitations and responses:**

| Hesitation | Response |
|------------|----------|
| Price concerns | "What number would make this a no-brainer for you?" |
| Need to consult someone | "That makes sense. Would it help if I was available to answer their questions too?" |
| Moving too fast | "I get it. There's no pressure here. But remember what you mentioned about {their_goal}? Getting this done means you can move forward with that." |
| Trust concerns | "What would help you feel more comfortable? I can provide references, or explain any part of the process in more detail." |

**If can't resolve:**
```
"Tell you what - why don't I give you a day or two to think it over? I'll call you back {day}. But I will say, I'd hate for you to miss this opportunity. We're actively buying in {county} right now, and our budget does get allocated. Sound fair?"
```

**Transition:**
→ `P1_RESCHEDULE` with callback OR continue to `P2_NEGOTIATION` if they engage

---

## STATE: P2_NEGOTIATION

**Purpose:** Work toward agreed price through negotiation tactics

**Entry Condition:** Seller has counter-offered or wants more than our offer

**Available Negotiation Tactics:**

### TACTIC 1: Emotional Anchor
**Use when:** Seller has stated a goal/vision earlier
```
"Can I ask - if we waved a magic wand and bought your property for {price}, what would that do for you and your family?"
```
[Reminds them WHY they want to sell]

### TACTIC 2: Consequence of No Deal
**Use when:** Seller has unrealistic expectations
```
"Got it. And what happens if you don't get that price?"
```
[Wait]
```
"Are your kids aware that's your plan? Are they prepared to take over the property and maintenance if anything were to happen to you?"
```

### TACTIC 3: "Wouldn't Even Consider"
**Use when:** Testing their floor
```
"Got it, so you wouldn't even consider an offer below {their_price}?"
```
**[Deliver slowly, with downward inflection - often reveals flexibility]**

### TACTIC 4: Split the Difference
**Use when:** Gap is closeable
```
"What if we met in the middle at {splitPrice}?"
```

### TACTIC 5: Terms Trade
**Use when:** Need to reach higher price
```
"If I could get you closer to {theirPrice}, would you be okay with a 90-day close instead of 30?"
```

### NEGOTIATION FLOW:

```javascript
async function negotiate() {
  const sellerPrice = callContext.keyInfo.sellerCounterOffer;
  const ourMax = callContext.lead.pricing.maxOffer;
  const ourTarget = callContext.lead.pricing.targetOffer;
  const gap = sellerPrice - ourMax;
  
  // ═══════════════════════════════════════════════════════════════════
  // SCENARIO 1: Seller is within our range
  // ═══════════════════════════════════════════════════════════════════
  if (sellerPrice <= ourMax) {
    // Try to negotiate down slightly
    speak(`Got it, so you wouldn't even consider an offer below ${formatCurrency(sellerPrice)}?`);
    
    const response = await waitForResponse();
    
    if (detectsFlexibility(response)) {
      // They might take less
      const counterOffer = Math.round(sellerPrice * 0.95 / 1000) * 1000;
      speak(`What if we could do ${formatCurrency(counterOffer)}?`);
      // Continue negotiation...
    } else {
      // Accept their price (it's within our range)
      callContext.contractData.agreedPrice = sellerPrice;
      return "P2_CONFIRM_AGREEMENT";
    }
  }
  
  // ═══════════════════════════════════════════════════════════════════
  // SCENARIO 2: Seller is above our range but possibly flexible
  // ═══════════════════════════════════════════════════════════════════
  else if (gap <= ourMax * 0.30) { // Within 30% of our max
    // Try emotional anchor
    speak(`I hear you on the ${formatCurrency(sellerPrice)}. Can I ask - what would that money do for you if we could make this happen?`);
    
    const response = await waitForResponse();
    
    // Reference their earlier vision
    const vision = callContext.keyInfo.sellerVision;
    speak(`Right, you mentioned wanting to ${vision}. That's important. Let me see what I can do.`);
    
    // Check if double close is viable
    speak(`Are you in any kind of rush to sell?`);
    const rushResponse = await waitForResponse();
    
    if (!detectsUrgency(rushResponse)) {
      // Double close might work
      return "P2_DOUBLE_CLOSE_CHECK";
    } else {
      // Try our max
      speak(`The absolute best I can do is ${formatCurrency(ourMax)}. Would that work for you?`);
      // Continue...
    }
  }
  
  // ═══════════════════════════════════════════════════════════════════
  // SCENARIO 3: Seller is way above our range
  // ═══════════════════════════════════════════════════════════════════
  else {
    speak(`I appreciate you sharing that number. Honestly, based on what properties are selling for in the area, ${formatCurrency(sellerPrice)} is quite a bit higher than what investors are paying.

What would happen if you didn't get that price?`);
    
    const response = await waitForResponse();
    
    if (detectsWillingToWait(response)) {
      speak(`Tell you what - I'll make a note and check back with you in 6 months to see if the market has moved or your situation has changed. Does that work?`);
      return "END_CALLBACK_SCHEDULED";
    } else {
      // One last attempt
      speak(`The very best I could do is ${formatCurrency(ourMax)}. Would that work for you?`);
      
      const finalResponse = await waitForResponse();
      
      if (detectsAcceptance(finalResponse)) {
        callContext.contractData.agreedPrice = ourMax;
        return "P2_CONFIRM_AGREEMENT";
      } else {
        return "P2_GRACEFUL_EXIT";
      }
    }
  }
}
```

---

## STATE: P2_DOUBLE_CLOSE_CHECK

**Purpose:** Determine if double close can bridge the price gap

**Entry Condition:** Seller wants more than our max, but isn't in a rush

**Agent Says:**
```
"Can I ask, {lead.firstName} - aside from the price, is there anything else that would prevent us from working together?"
```

**[WAIT FOR RESPONSE - confirm only price is the issue]**

```
"So if I could get you {sellerPrice}, we'd be able to do this deal?"
```

**[WAIT FOR CONFIRMATION]**

```
"And you mentioned you're not in any kind of rush to sell, right?"
```

**[WAIT FOR CONFIRMATION]**

```
"Okay great, well then it looks like I should be able to get you that price - the terms just look a little different. Do you want to hear more about that?"
```

**[WAIT FOR RESPONSE]**

**If interested:**
→ `P2_DOUBLE_CLOSE_PITCH`

**If not interested:**
→ Return to `P2_NEGOTIATION` or `P2_GRACEFUL_EXIT`

---

## STATE: P2_DOUBLE_CLOSE_PITCH

**Purpose:** Explain double close / assignment structure

**Entry Condition:** Seller open to hearing alternative terms

**Agent Says:**
```
"So in the past {years} years of investing, we've gotten really good at buying property, and we've also gotten really good at selling property.

Normally we do one of two things: we either buy the property from you outright, or we work with partners to buy it - which is super common when purchasing properties.

So in order for us to get you that price, we would just need 90 to 180 days instead of 30 to make sure our partners have time to do their due diligence, and also for us to potentially market the property using agent networks and the MLS to find the right buying partner.

This doesn't change anything on your end - it's still the same simple process we chatted about. But since you mentioned you're not in a rush, it's the perfect way for us to work together.

In 90 days, the title company is going to be asking you whether you want a wire or a check at closing.

What questions do you have?"
```

**[WAIT FOR RESPONSE]**

**Handle Double Close Objections:**

**"Why so long?"**
```
"Great question! When we're the only partner involved, we can close fastest, but our price ranges are stricter. For us to get you that higher price, our partners need time for their own due diligence.

Just to confirm - you did mention you weren't in a rush, right?"
```

**"What if you back out?"**
```
"Most of our clients ask that exact question - and it's smart to ask.

I'll tell you, the only reason we ever back out is if something's wrong with the property physically or with the title. Do you know of any issues with the property?

[WAIT]

Perfect. Then I wouldn't worry. We've actually backed out of less than 1% of deals we've put under contract.

We also add earnest money to every contract - so after our due diligence period ends, you keep that money regardless of whether we close. It shows we're serious.

What other questions do you have?"
```

**If agrees to double close structure:**
```javascript
callContext.contractData.dealStructure = "DOUBLE_CLOSE";
callContext.contractData.closingDays = 90; // or 180
callContext.contractData.agreedPrice = sellerPrice;
```
→ `P2_CONFIRM_AGREEMENT`

---

## STATE: P2_CONFIRM_AGREEMENT

**Purpose:** Confirm price and clear any final objections before contract

**Entry Condition:** Price agreed (either standard or double close)

**Agent Says:**
```
"Great, so just to confirm - if we could get you {agreedPrice}, there wouldn't be anything else preventing us from working together?"
```

**[WAIT FOR RESPONSE]**

**Detection:**

| Response | Action |
|----------|--------|
| "Correct" / "That's right" / "No, nothing else" | → `P2_COLLECT_CONTRACT_DATA` |
| New objection surfaces | Handle the objection, may return to `P2_DEAL_KILLERS` |
| "Let me think about it" | → `P2_HANDLE_HESITATION` |

**If confirmed:**
```
"Awesome. We can get that done. Would you be able to go over the contract now? I can send it right over and walk you through it."
```

**[WAIT FOR RESPONSE]**

**If yes:**
→ `P2_COLLECT_CONTRACT_DATA`

**If not now:**
```
"No problem! When would be a good time to go over it together? I want to make sure I can answer any questions while we're looking at it."
```
→ Schedule callback with contract ready

---

## STATE: P2_GRACEFUL_EXIT

**Purpose:** End acquisition attempt gracefully when deal isn't possible

**Entry Condition:** Cannot reach agreement

**Agent Says:**
```
"I understand, {lead.firstName}. I appreciate you taking the time to talk through this with me. We're clearly not going to be able to come together on price right now, and I respect that.

Would it be alright if I kept your information on file and reached out if the market changes?"
```

**[WAIT FOR RESPONSE]**

**If yes:**
```
"I appreciate that. In the meantime, if anything changes on your end - your timeline, your situation, or even just if you want to chat more about it - give me a call. This is my direct line.

Take care, {lead.firstName}!"
```

**If no:**
```
"No problem at all. I wish you the best with the property. Take care!"
```

**Actions:**
```javascript
await triggerWebhook("update_lead", {
  leadId: callContext.lead.id,
  status: "price_disagreement",
  sellerAskingPrice: callContext.keyInfo.sellerCounterOffer,
  ourMaxOffer: callContext.lead.pricing.maxOffer,
  followUpDate: addMonths(new Date(), 6),
  notes: callContext.keyInfo
});
```

**Transition:**
→ `END_NO_DEAL`

---

*[CONTINUED IN PART 3: Contract Flow, Terminal States, Global Handlers, Edge Cases]*
# LandVerse AI Agent - Complete Call Flow Specification
## PART 3: Contract Flow, Terminal States, Global Handlers, Edge Cases

---

# 6. CONTRACT FLOW

## STATE: P2_COLLECT_CONTRACT_DATA

**Purpose:** Collect/confirm all data needed for contract before generating

**Entry Condition:** Price agreed, seller ready to proceed with contract

### DATA COLLECTION SEQUENCE

**Step 1: Confirm Seller Legal Name**
```
"First, I need to make sure I have your information correct for the contract. What is your full legal name as it should appear on the agreement?"
```

**[WAIT FOR RESPONSE]**

**Capture and confirm:**
```javascript
callContext.contractData.sellerLegalName = response;
```
```
"Perfect - so that's {spelled_out_name}. Is that correct?"
```

**If co-owner exists:**
```
"And what is your {coOwnerRelation}'s full legal name?"
```
```javascript
callContext.contractData.coOwnerLegalName = response;
```

---

**Step 2: Collect Email Address (for DocuSign)**
```
"I'll need your email address to send the contract over. What's the best email for you?"
```

**[WAIT FOR RESPONSE]**

**Confirm by spelling back:**
```javascript
callContext.contractData.sellerEmail = extractEmail(response);
```
```
"Let me make sure I have that right - that's {spell_out_email}. Correct?"
```

**If no email:**
```
"Do you have an email address you could check? That's how we send the contract for electronic signature."
```

**If truly no email:**
```javascript
callContext.flags.push("NO_EMAIL_NEEDS_MANUAL_CONTRACT");
```
```
"No problem! I can have a physical contract overnighted to you instead. What's your current mailing address?"
```
→ Collect mailing address, transition to manual contract flow

---

**Step 3: Confirm Mailing Address**
```
"And what's your current mailing address? This is where we'd send any physical correspondence."
```

**[WAIT FOR RESPONSE]**

```javascript
callContext.contractData.sellerMailingAddress = response;
```

---

**Step 4: Confirm Property Details**
```
"Let me just confirm the property details:
- {lead.acreage} acres in {lead.county} County
- The address shows as {lead.propertyAddress}

Is that all correct?"
```

**[WAIT FOR CONFIRMATION]**

**If incorrect:**
```
"What's the correct information?"
```
[Capture corrections]

---

**Step 5: Confirm Price (CRITICAL)**
```
"And just to be crystal clear, we're agreeing on a purchase price of {formatCurrency(agreedPrice)}. Is that correct?"
```

**[WAIT FOR EXPLICIT CONFIRMATION]**

**If any hesitation:**
```
"I want to make sure we're on exactly the same page. The price is {spellOutCurrency(agreedPrice)} - is that the number you're agreeing to?"
```

**Double-confirm by spelling:**
```javascript
function spellOutCurrency(amount) {
  // $32,500 -> "thirty-two thousand five hundred dollars"
  const words = numberToWords(amount);
  return words + " dollars";
}
```

---

**Step 6: Confirm Timeline**
```
"And we're looking at a closing date about {closingDays} days from now, which would be around {calculateClosingDate()}. Does that timeline work for you?"
```

**[WAIT FOR CONFIRMATION]**

---

### VALIDATE ALL DATA

```javascript
async function validateContractData() {
  const required = {
    sellerLegalName: callContext.contractData.sellerLegalName,
    sellerEmail: callContext.contractData.sellerEmail,
    sellerMailingAddress: callContext.contractData.sellerMailingAddress,
    agreedPrice: callContext.contractData.agreedPrice,
    propertyAddress: callContext.lead.propertyAddress,
    acreage: callContext.lead.acreage,
    county: callContext.lead.county,
    state: callContext.lead.state
  };
  
  const missing = [];
  for (const [field, value] of Object.entries(required)) {
    if (!value) {
      missing.push(field);
    }
  }
  
  if (missing.length > 0) {
    return { valid: false, missing };
  }
  
  return { valid: true };
}
```

**Transition:**
→ `P2_GENERATE_CONTRACT`

---

## STATE: P2_GENERATE_CONTRACT

**Purpose:** Generate contract via DocuSign and send to seller

**Entry Condition:** All contract data collected and validated

**Agent Says:**
```
"Perfect! Give me just one moment to prepare the agreement..."
```

**[ACTION: Generate contract]**

```javascript
async function generateContract() {
  // Calculate derived fields
  const closingDate = addBusinessDays(new Date(), callContext.contractData.closingDays || 30);
  const earnestMoney = calculateEarnestMoney(callContext.contractData.agreedPrice);
  const dueDiligenceDays = callContext.contractData.dealStructure === "DOUBLE_CLOSE" ? 60 : 14;
  
  // Prepare contract data
  const contractData = {
    // Seller
    sellerName: callContext.contractData.sellerLegalName,
    sellerAddress: formatAddress(callContext.contractData.sellerMailingAddress),
    sellerPhone: formatPhone(callContext.lead.phone),
    sellerEmail: callContext.contractData.sellerEmail,
    
    // Co-owner (if applicable)
    hasCoOwner: callContext.keyInfo.hasCoOwner,
    coOwnerName: callContext.contractData.coOwnerLegalName || null,
    
    // Property
    propertyAddress: callContext.lead.propertyAddress,
    propertyAPN: callContext.lead.apn || "To be confirmed by title",
    propertyCounty: callContext.lead.county,
    propertyState: callContext.lead.state,
    propertyLegalDescription: callContext.lead.legalDescription || callContext.lead.propertyAddress,
    acreage: callContext.lead.acreage.toString(),
    
    // Terms
    purchasePrice: formatCurrency(callContext.contractData.agreedPrice),
    purchasePriceWritten: numberToWords(callContext.contractData.agreedPrice) + " Dollars",
    purchasePriceNumeric: callContext.contractData.agreedPrice,
    earnestMoney: formatCurrency(earnestMoney),
    earnestMoneyNumeric: earnestMoney,
    closingDate: formatDate(closingDate),
    dueDiligenceDays: dueDiligenceDays.toString(),
    
    // Buyer
    buyerName: CONFIG.companyLegalName,
    buyerAddress: CONFIG.companyAddress,
    
    // Title Company
    titleCompanyName: CONFIG.titleCompany.name,
    titleCompanyAddress: CONFIG.titleCompany.address
  };
  
  // Select template based on deal structure
  const templateId = callContext.contractData.dealStructure === "DOUBLE_CLOSE"
    ? CONFIG.docusign.doubleCloseTemplateId
    : CONFIG.docusign.standardTemplateId;
  
  // Create DocuSign envelope
  try {
    const envelope = await docusignApi.createEnvelope({
      accountId: CONFIG.docusign.accountId,
      envelopeDefinition: {
        templateId: templateId,
        templateRoles: [{
          email: contractData.sellerEmail,
          name: contractData.sellerName,
          roleName: "Seller",
          tabs: {
            textTabs: Object.entries(contractData)
              .filter(([key, value]) => value !== null && typeof value !== 'boolean')
              .map(([tabLabel, value]) => ({
                tabLabel,
                value: String(value)
              }))
          }
        }],
        status: "sent",
        emailSubject: `Purchase Agreement - ${callContext.lead.propertyAddress}`,
        emailBlurb: "Please review and sign the attached purchase agreement for your property."
      }
    });
    
    // Store envelope info
    callContext.contract = {
      envelopeId: envelope.envelopeId,
      status: "sent",
      sentAt: new Date().toISOString(),
      data: contractData
    };
    
    callContext.contractSent = true;
    
    // Log
    await triggerWebhook("contract_sent", {
      leadId: callContext.lead.id,
      envelopeId: envelope.envelopeId,
      purchasePrice: callContext.contractData.agreedPrice,
      dealStructure: callContext.contractData.dealStructure
    });
    
    return { success: true, envelope };
    
  } catch (error) {
    // DocuSign failed
    callContext.errors.push({ type: "DOCUSIGN_ERROR", error: error.message });
    return { success: false, error };
  }
}
```

**If DocuSign fails:**
```
"I'm having a small technical issue with our document system. Let me try that again..."
```
[Retry once]

**If still fails:**
```
"I apologize - our document system is being difficult. Can I email the contract to you manually within the next few minutes?"
```
```javascript
callContext.flags.push("MANUAL_CONTRACT_SEND_REQUIRED");
```
→ `END_CONTRACT_PENDING_MANUAL`

**If successful:**
```
"Alright, I've just sent the purchase agreement to {sellerEmail}. Let me walk you through it together."
```
→ `P2_CONTRACT_WALKTHROUGH`

---

## STATE: P2_CONTRACT_WALKTHROUGH

**Purpose:** Walk seller through contract live on the call

**Entry Condition:** Contract sent via DocuSign

### STEP 1: CONFIRM EMAIL RECEIPT

**Agent Says:**
```
"Can you check your email for me? You should see an email from DocuSign with the subject line about your property."
```

**[WAIT FOR RESPONSE]**

**Troubleshooting:**

| Seller Says | Response |
|-------------|----------|
| "I see it" | "Perfect! Go ahead and click on that email." |
| "I don't see it" / "Not there yet" | "It might take a minute. Can you check your spam or junk folder? Sometimes DocuSign emails end up there." |
| "Still don't see it" | "Let me verify the email - I sent it to {email}. Is that correct?" |
| "Wrong email" | "Let me resend it to the correct address. What's the right email?" [Resend] |
| "I'm not at a computer" | "Do you have a smartphone? You can open it on your phone too. Or I can wait while you get to a computer." |
| "I don't have email access right now" | "No problem! When would you be able to access it? I can call you back and walk through it then." |

**Maximum wait: 2 minutes**

---

### STEP 2: OPEN THE DOCUMENT

**Agent Says:**
```
"Great! Now click on that email, and you should see a yellow button that says 'Review Document' or 'Review Documents'. Go ahead and click that."
```

**[WAIT FOR CONFIRMATION]**

**Troubleshooting:**

| Issue | Response |
|-------|----------|
| "I don't see a yellow button" | "It might say 'Review' or 'Sign'. It's usually a prominent button in the email." |
| "It's asking me to log in" | "You shouldn't need to create an account. Look for a link that says 'Continue as Guest' or just 'Review Document'." |
| "It opened" | "Perfect! Now you should see the contract document." |

---

### STEP 3: OVERVIEW

**Agent Says:**
```
"Alright {lead.firstName}, so as you can see, our agreements are really straightforward - we keep them simple so anyone can read them.

Let me walk you through the key parts."
```

**[BRIEF PAUSE]**

---

### STEP 4: SELLER INFORMATION

**Agent Says:**
```
"At the top, you'll see your name listed as the Seller - it shows '{sellerLegalName}'. And your address as '{sellerMailingAddress}'.

Is all of that correct?"
```

**[WAIT FOR CONFIRMATION]**

**If incorrect:**
```
"What should the correct information be?"
```
```javascript
// May need to regenerate contract with corrections
callContext.flags.push("CONTRACT_CORRECTION_NEEDED");
// For now, note the correction and continue - can update after
```

---

### STEP 5: PROPERTY INFORMATION

**Agent Says:**
```
"Next you'll see the property details - your {acreage} acres in {county} County. The address shows as {propertyAddress}.

Does that match your property?"
```

**[WAIT FOR CONFIRMATION]**

---

### STEP 6: PURCHASE PRICE (CRITICAL)

**Agent Says:**
```
"Now here's the important part - you'll see the purchase price of {formatCurrency(agreedPrice)}.

That's the same amount we agreed on, correct?"
```

**[WAIT FOR EXPLICIT CONFIRMATION]**

**If hesitation or objection:**

```javascript
const PRICE_OBJECTION_HANDLERS = {
  "wants_more": {
    script: `I understand. We did discuss this based on what properties are selling for in {county}. 

Remember what you mentioned earlier about {referenceMotivation}? Getting this done means you can move forward with that.

Is {price} something you can work with?`
  },
  
  "cold_feet": {
    script: `I totally get it - this is a big decision. But remember, signing this doesn't mean you're handing over the property today.

We still have {closingDays} days before closing, and the title company protects both of us throughout the process.

What specific concern do you have?`
  },
  
  "need_to_think": {
    script: `Of course. I don't want to rush you.

Tell you what - take a look at the full document, and if you have any questions, I'm happy to answer them. 

Would you like me to give you some time and call back tomorrow?`
  }
};
```

**If still hesitating after handling:**
→ May need to transition to `P1_RESCHEDULE` with pending contract

---

### STEP 7: CLOSING TIMELINE

**Agent Says:**
```
"Below that, you'll see we're set to close on {closingDate}. That gives us {closingDays} days to get everything wrapped up.

During that time, we do our due diligence - making sure there are no issues with the title, no liens, and that the property is what we expect. That usually takes us about {dueDiligenceDays} days.

Does that timeline work for you?"
```

**[WAIT FOR CONFIRMATION]**

**If timeline concern:**

| Concern | Response |
|---------|----------|
| "Too fast" | "We can extend that if you need more time. What date would work better?" |
| "Too slow" | "Sometimes we can close faster if everything checks out cleanly. Let's keep this as the target and we'll do our best to beat it." |

---

### STEP 8: EARNEST MONEY (if applicable)

**Agent Says:**
```
"You'll also see that we're putting down {earnestMoney} in earnest money. This shows we're serious about the deal. After our due diligence period, that money is yours regardless of whether we close."
```

**[PAUSE FOR ACKNOWLEDGMENT]**

---

### STEP 9: FINAL QUESTIONS

**Agent Says:**
```
"That's really the whole agreement - told you it was simple!

Do you have any questions about anything before you sign?"
```

**[WAIT FOR RESPONSE]**

**Handle Common Questions:**

```javascript
const CONTRACT_QUESTIONS = {
  
  "what_if_you_back_out": {
    detect: ["what if you back out", "what if you cancel", "what if you don't close"],
    response: `The only reason we'd back out is if we find something seriously wrong with the property or the title.

Do you know of any issues with the property physically or legally?

[WAIT]

Perfect. Then we should be all set. We've closed on hundreds of properties and backed out of less than 1%.`
  },
  
  "what_happens_after": {
    detect: ["what happens after", "what's next", "then what"],
    response: `Great question! After you sign:
- I send this to our title company
- They do a title search to make sure everything's clean
- We do our due diligence inspection
- Title prepares the closing documents
- We wire the funds
- You get paid

Simple as that. Any questions about that process?`
  },
  
  "can_lawyer_review": {
    detect: ["lawyer", "attorney", "legal review"],
    response: `Absolutely! Take as much time as you need to have your attorney review it.

How long do you think you'd need? I can call you back once they've had a chance to look at it.`
  },
  
  "this_is_fast": {
    detect: ["too fast", "rushing", "slow down"],
    response: `I understand it feels fast. But remember - signing this doesn't mean you're giving up the property today.

We still have {closingDays} days before closing. The title company protects both of us. And you don't transfer ownership until you receive the funds.

What's your specific concern?`
  },
  
  "what_about_taxes": {
    detect: ["taxes", "property tax", "back taxes"],
    response: `Good question. Any property taxes owed would typically be prorated at closing - meaning we'd split them based on the closing date. The title company handles all of that.

If there are back taxes, those would come out of the sale proceeds. Do you know of any back taxes owed?`
  }
};
```

---

### STEP 10: GUIDE TO SIGNATURE

**Agent Says:**
```
"Great! So now scroll down in the document. You'll see a yellow 'Sign' tag or button. Go ahead and click on that."
```

**[WAIT]**

```
"Perfect! Now you can either draw your signature using your mouse or finger, or type your name and it'll create a signature for you. Whichever is easier for you."
```

**[WAIT]**

```
"Got it?

Now click the 'Finish' button at the bottom of the screen to complete the signing."
```

**[WAIT FOR CONFIRMATION]**

---

### STEP 11: CONFIRM SIGNATURE RECEIPT

**[ACTION: Poll DocuSign for completion]**

```javascript
async function waitForSignature() {
  const maxWait = 90; // seconds
  const pollInterval = 3; // seconds
  const startTime = Date.now();
  
  while ((Date.now() - startTime) < maxWait * 1000) {
    const status = await docusignApi.getEnvelopeStatus({
      accountId: CONFIG.docusign.accountId,
      envelopeId: callContext.contract.envelopeId
    });
    
    if (status.status === "completed") {
      return { success: true, completedAt: status.completedDateTime };
    }
    
    if (status.status === "declined") {
      return { success: false, declined: true, reason: status.declinedReason };
    }
    
    await sleep(pollInterval * 1000);
  }
  
  return { success: false, timeout: true };
}
```

**Agent Says (while polling):**
```
"Just confirming we received it on our end..."
```

**If received:**
```
"We just received the signed copy on our end - congratulations {lead.firstName}!"
```
→ `P2_POST_SIGNATURE`

**If not received:**
```
"Hmm, I'm not seeing it yet on my end. Can you make sure you clicked the yellow Finish button?"
```

**[WAIT]**

```
"Try scrolling down to make sure you signed everywhere required, then click Finish."
```

**If still not received after retry:**
```
"It seems like there might be a technical issue. Don't worry - I have your signed intent on record. Let me follow up with you via email to make sure we have everything sorted out.

You should still receive a confirmation email from DocuSign. Is {email} the best place to reach you?"
```
```javascript
callContext.flags.push("SIGNATURE_CONFIRMATION_NEEDED");
```
→ `END_CONTRACT_PENDING_CONFIRMATION`

---

## STATE: P2_POST_SIGNATURE

**Purpose:** Set expectations for next steps and close call warmly

**Entry Condition:** Contract signed and confirmed

**Agent Says:**
```
"Congratulations again, {lead.firstName}! This is exciting.

So here's what happens next:

We're going to send this agreement over to our title company, {titleCompanyName}. They're in charge of legally transferring the ownership and making sure all the funds move correctly so everyone is protected.

Between now and closing:
- Our team will check in with you every week or two with updates
- Title will send you some documents to sign
- We'll wire the funds to the title company
- And then they'll wire you your money

The important thing to know is - we can't legally take ownership until the funds are wired to you in full. So you're completely protected throughout this process.

Does that all make sense?"
```

**[WAIT FOR CONFIRMATION]**

```
"Do you have any other questions for me today?"
```

**[HANDLE ANY QUESTIONS]**

```
"Perfect! It was really great chatting with you today, {lead.firstName}. If you think of any questions, this is my direct line - feel free to call or text anytime.

Thanks again - and have a great {timeOfDay}!"
```

**POST-CALL ACTIONS:**

```javascript
async function completeContractSigning() {
  // 1. Update CRM
  await triggerWebhook("deal_created", {
    leadId: callContext.lead.id,
    dealId: generateDealId(),
    purchasePrice: callContext.contractData.agreedPrice,
    dealStructure: callContext.contractData.dealStructure,
    closingDate: callContext.contract.data.closingDate,
    docusignEnvelopeId: callContext.contract.envelopeId,
    sellerName: callContext.contractData.sellerLegalName,
    sellerEmail: callContext.contractData.sellerEmail,
    sellerPhone: callContext.lead.phone,
    propertyAddress: callContext.lead.propertyAddress,
    acreage: callContext.lead.acreage,
    county: callContext.lead.county,
    state: callContext.lead.state,
    callRecordingUrl: callContext.recordingUrl,
    callTranscriptUrl: callContext.transcriptUrl,
    callDuration: Date.now() - callContext.startTime,
    keyInfo: callContext.keyInfo
  });
  
  // 2. Notify team
  await triggerWebhook("slack_notification", {
    channel: "#deals",
    message: `🎉 *NEW CONTRACT SIGNED!*
    
*Property:* ${callContext.lead.propertyAddress}
*Seller:* ${callContext.contractData.sellerLegalName}
*Price:* ${formatCurrency(callContext.contractData.agreedPrice)}
*Structure:* ${callContext.contractData.dealStructure}
*Closing:* ${callContext.contract.data.closingDate}
*Agent:* ${CONFIG.agentName}

Recording: ${callContext.recordingUrl}`
  });
  
  // 3. Send to title company
  await triggerWebhook("send_to_title", {
    titleCompanyEmail: CONFIG.titleCompany.email,
    envelopeId: callContext.contract.envelopeId,
    contractData: callContext.contract.data
  });
  
  // 4. Send seller confirmation email
  await triggerWebhook("send_email", {
    to: callContext.contractData.sellerEmail,
    template: "contract_confirmation",
    data: {
      sellerName: callContext.lead.firstName,
      propertyAddress: callContext.lead.propertyAddress,
      purchasePrice: formatCurrency(callContext.contractData.agreedPrice),
      closingDate: callContext.contract.data.closingDate,
      titleCompanyName: CONFIG.titleCompany.name,
      agentName: CONFIG.agentName,
      agentPhone: CONFIG.companyPhone
    }
  });
  
  // 5. Schedule follow-up touchpoints
  await triggerWebhook("create_follow_up_sequence", {
    dealId: callContext.dealId,
    touchpoints: [
      { daysFromNow: 7, type: "seller_check_in_call" },
      { daysFromNow: 14, type: "seller_update_sms" },
      { daysFromNow: 21, type: "seller_check_in_call" },
      { daysFromClose: -3, type: "closing_prep_call" }
    ]
  });
  
  callContext.contractSigned = true;
}
```

**Transition:**
→ `END_CONTRACT_SIGNED`

---

# 7. TERMINAL STATES

## END_APPOINTMENT_SET

**Outcome:** Appointment successfully scheduled

**Required Data:**
- Appointment date/time
- Appointment with (name)
- Seller email or SMS confirmation
- Qualification score
- Key information collected

**Actions:**
```javascript
{
  status: "appointment_scheduled",
  appointmentTime: callContext.appointment.dateTime,
  appointmentWith: callContext.appointment.with,
  sellerEmail: callContext.appointment.email,
  qualificationScore: callContext.qualificationScore,
  interestLevel: callContext.interestLevel,
  keyInfo: callContext.keyInfo,
  callRecordingUrl: callContext.recordingUrl,
  callDuration: Date.now() - callContext.startTime
}
```

---

## END_CONTRACT_SIGNED

**Outcome:** Contract executed, deal under contract

**Required Data:**
- All contract data
- DocuSign envelope ID
- Agreed price
- Closing date
- Deal structure

**Actions:** (See P2_POST_SIGNATURE)

---

## END_CALLBACK_SCHEDULED

**Outcome:** Callback scheduled for future

**Variants:**
- Seller requested callback (specific time)
- Follow-up scheduled (6 months, etc.)
- Hot lead callback (escalation time not available)
- Joint call with co-owner scheduled

**Actions:**
```javascript
{
  status: "callback_scheduled",
  callbackTime: extractedDateTime,
  callbackReason: reason,
  callbackPriority: "hot" | "warm" | "cold",
  notes: callContext.keyInfo,
  callRecordingUrl: callContext.recordingUrl
}
```

---

## END_NOT_INTERESTED

**Outcome:** Seller declined, no future follow-up

**Actions:**
```javascript
{
  status: "not_interested",
  reason: determinedReason,
  permanentDNC: false,
  callRecordingUrl: callContext.recordingUrl
}
```

---

## END_DO_NOT_CALL

**Outcome:** Seller requested DNC

**Actions:**
```javascript
// CRITICAL: Add to DNC list immediately
await triggerWebhook("add_to_dnc", {
  phone: callContext.lead.phone,
  leadId: callContext.lead.id,
  requestedAt: new Date().toISOString(),
  source: "verbal_request",
  callRecordingUrl: callContext.recordingUrl
});

{
  status: "dnc",
  dncRequestedAt: new Date().toISOString(),
  permanentDNC: true
}
```

---

## END_VOICEMAIL

**Outcome:** Reached voicemail, left message

**Voicemail Script:**
```
"Hi {lead.firstName}, this is {CONFIG.agentName} with {CONFIG.companyName}. 

I'm calling about your property in {lead.county}. We're a local company that buys land for cash and I wanted to see if you'd be interested in hearing an offer.

When you get a chance, please give me a call back at {CONFIG.companyPhone}. 

Again, that's {CONFIG.agentName} with {CONFIG.companyName} at {CONFIG.companyPhone}.

Hope to hear from you soon - have a great day!"
```

**Actions:**
```javascript
{
  status: "voicemail_left",
  voicemailAt: new Date().toISOString(),
  followUpDate: addDays(new Date(), 2),
  attemptNumber: callContext.attemptNumber || 1
}
```

---

## END_WRONG_NUMBER

**Outcome:** Wrong number or person

**Actions:**
```javascript
{
  status: "wrong_number",
  notes: "Phone number does not reach property owner",
  newContactInfo: extractedNewContactInfo || null
}
```

---

## END_NO_DEAL

**Outcome:** Acquisition attempted but couldn't agree on price

**Actions:**
```javascript
{
  status: "no_deal_price",
  ourMaxOffer: callContext.lead.pricing.maxOffer,
  sellerAskingPrice: callContext.keyInfo.sellerCounterOffer,
  gap: callContext.keyInfo.sellerCounterOffer - callContext.lead.pricing.maxOffer,
  followUpDate: addMonths(new Date(), 6),
  notes: callContext.keyInfo
}
```

---

## END_CONTRACT_PENDING_MANUAL

**Outcome:** Contract needs manual send (DocuSign failed)

**Actions:**
```javascript
{
  status: "contract_pending_manual",
  agreedPrice: callContext.contractData.agreedPrice,
  sellerEmail: callContext.contractData.sellerEmail,
  urgentFollowUp: true,
  notes: "DocuSign failed - manual send required"
}
```

---

## END_CONTRACT_PENDING_CONFIRMATION

**Outcome:** Contract sent but signature not confirmed

**Actions:**
```javascript
{
  status: "contract_pending_confirmation",
  envelopeId: callContext.contract.envelopeId,
  agreedPrice: callContext.contractData.agreedPrice,
  followUpRequired: true
}
```

---

# 8. GLOBAL HANDLERS

These handlers can be triggered from ANY state in the conversation.

## HANDLER: DNC_REQUEST

**Detection Patterns:**
```javascript
const DNC_PATTERNS = [
  "do not call",
  "don't call me",
  "stop calling",
  "remove my number",
  "take me off your list",
  "no more calls",
  "never call again",
  "this is harassment",
  "I'm reporting you"
];
```

**Response:**
```
"I completely understand, and I apologize for any inconvenience. I'm removing your number from our list right now. You won't receive any more calls from us. Have a great day."
```

**Actions:**
```javascript
// Immediate DNC addition
await triggerWebhook("add_to_dnc", {
  phone: callContext.lead.phone,
  leadId: callContext.lead.id,
  requestedAt: new Date().toISOString()
});
```

**Transition:**
→ `END_DO_NOT_CALL`

---

## HANDLER: REPEAT_REQUEST

**Detection Patterns:**
```javascript
const REPEAT_PATTERNS = [
  "what did you say",
  "say that again",
  "repeat that",
  "I didn't catch that",
  "huh",
  "what",
  "can you repeat",
  "I missed that"
];
```

**Response:**
```
"Of course! Let me say that again..."
[Repeat last statement at slightly slower pace]
```

---

## HANDLER: SLOW_DOWN

**Detection Patterns:**
```javascript
const SLOW_DOWN_PATTERNS = [
  "slow down",
  "you're talking too fast",
  "too fast",
  "wait a minute",
  "hold on"
];
```

**Response:**
```
"I apologize about that! Let me slow down..."
[Reduce speaking pace for remainder of call]
```

---

## HANDLER: HOLD_REQUEST

**Detection Patterns:**
```javascript
const HOLD_PATTERNS = [
  "hold on",
  "one second",
  "give me a minute",
  "someone's at the door",
  "I have another call",
  "hang on"
];
```

**Response:**
```
"No problem! Take your time."
```

**Behavior:**
- Wait up to 120 seconds
- Check in after 60 seconds: "Still there?"
- If no response after 120 seconds: "Hello? I think I may have lost you. I'll try calling back."

---

## HANDLER: AI_DISCLOSURE

**Detection Patterns:**
```javascript
const AI_PATTERNS = [
  "are you a robot",
  "is this a robot",
  "am I talking to a robot",
  "is this AI",
  "are you a real person",
  "are you human",
  "is this automated",
  "are you a computer"
];
```

**Response (DISCLOSURE OPTION - choose based on company policy):**

**Option A - Full Disclosure:**
```
"I'm an AI assistant helping {CONFIG.companyName} reach property owners. I can answer your questions and discuss your property. If you'd prefer to speak with a human team member, I'm happy to connect you. Would you like that?"
```

**Option B - Deflect:**
```
"I'm {CONFIG.agentName} from {CONFIG.companyName}. Is there something specific I can help you with about your property?"
```

**If they request human:**
```
"Absolutely! Let me get you connected with one of our team members. What's the best time to reach you?"
```
→ Schedule human callback

---

## HANDLER: HOSTILE_BEHAVIOR

**Detection Patterns:**
```javascript
const HOSTILE_PATTERNS = [
  "f*** off",
  "go to hell",
  "scam",
  "scammer",
  "fraud",
  "I'm going to sue",
  "I'm calling the police",
  "you people are criminals"
];
```

**Response:**
```
"I'm sorry you feel that way. I certainly don't want to cause you any frustration. I'll remove your number from our list. Have a good day."
```

**Transition:**
→ `END_DO_NOT_CALL`

---

## HANDLER: TRANSFER_REQUEST

**Detection Patterns:**
```javascript
const TRANSFER_PATTERNS = [
  "speak to a manager",
  "talk to your supervisor",
  "get me your boss",
  "I want a real person",
  "speak to someone else"
];
```

**Response:**
```
"Absolutely! Let me connect you with one of our team members. Can I get the best number to reach you and a good time for them to call?"
```

**Actions:**
```javascript
await triggerWebhook("human_escalation_requested", {
  leadId: callContext.lead.id,
  reason: "seller_requested",
  priority: "high",
  currentState: callContext.currentState,
  keyInfo: callContext.keyInfo
});
```

---

## HANDLER: SILENCE

**Detection:** No speech detected for 8+ seconds

**Response Sequence:**
1. (After 8 seconds): "Hello? Are you still there?"
2. (After another 8 seconds): "{lead.firstName}? I think we may have a bad connection."
3. (After another 8 seconds): "It sounds like I may have lost you. I'll try calling back. Take care!"

**Transition:**
→ `END_CALL_DROPPED` (schedule immediate callback)

---

## HANDLER: CALL_QUALITY

**Detection:** Transcription confidence < 0.5 repeatedly

**Response:**
```
"I'm sorry, I'm having a little trouble hearing you. Could you say that again?"
```

**If persists:**
```
"It sounds like we have a bad connection. Would you mind if I called you right back? Sometimes that helps."
```

---

# 9. EDGE CASE HANDLERS

## HANDLER: DECEASED_OWNER

**Detection Patterns:**
```javascript
const DECEASED_PATTERNS = [
  "passed away",
  "died",
  "deceased",
  "no longer with us",
  "passed on",
  "death",
  "gone"
];
```

**Response:**
```
"I'm so sorry for your loss. I didn't mean to bring up anything difficult.

Has the property been transferred to anyone, or is it still in the estate?"
```

**[LISTEN FOR: executor, probate, inherited, heirs]**

**If can identify new owner:**
```
"Would you mind sharing their contact information? I'd like to reach out to them instead. Or if you're handling the estate, we do work with estates regularly."
```

**If in probate:**
```
"I understand. Probate can take time. Would it be helpful if I checked back in a few months when things might be more settled?"
```

**Actions:**
```javascript
callContext.flags.push("DECEASED_OWNER");
callContext.keyInfo.deceasedOwner = true;
callContext.keyInfo.estateDetails = response;
```

---

## HANDLER: MULTIPLE_OWNERS_COMPLEX

**Trigger:** More than 2 owners, family disputes, unclear ownership

**Response:**
```
"It sounds like there are a few moving parts with the ownership. We work with complex situations like this all the time.

Is there one person who kind of takes the lead for the family on property decisions?"
```

**If dispute mentioned:**
```
"I understand. Family situations can be complicated. Would it be helpful if I provided a cash offer that everyone could consider? Sometimes having a number on the table helps move conversations forward."
```

**Flag:**
```javascript
callContext.flags.push("COMPLEX_OWNERSHIP");
callContext.keyInfo.ownershipComplexity = details;
```

---

## HANDLER: PROPERTY_ISSUES

**Detection and Handling:**

### Back Taxes
**Detection:** "taxes", "owe taxes", "tax lien", "back taxes"

```
"Thanks for mentioning that. Do you happen to know roughly how much is owed in back taxes?"
```

**If amount given:**
```javascript
callContext.keyInfo.propertyIssues.backTaxes = extractedAmount;
```

```
"Got it - {amount} in back taxes. That's something we can work with. Those would get paid off at closing and come out of the proceeds. So you'd net {agreedPrice - amount} after the taxes are cleared.

Does that make sense?"
```

---

### Liens
**Detection:** "lien", "judgment", "owe money"

```
"Can you tell me more about that lien? Do you know the amount and who it's owed to?"
```

```javascript
callContext.keyInfo.propertyIssues.liens = details;
```

---

### Access Issues
**Detection:** "landlocked", "no road access", "can't get to it"

```
"Thanks for letting me know about the access. Is there any kind of easement in place, or would someone need to cross another property?"
```

**If no legal access:**
```
"Access issues can affect value. Let me talk to my team and get back to you with what we could offer knowing that. Can I call you back tomorrow?"
```

```javascript
callContext.flags.push("ACCESS_ISSUE");
```

---

### Environmental
**Detection:** "wetlands", "flood zone", "contamination"

```
"Can you tell me more about the environmental situation?"
```

**Handle based on severity - may need to pass or adjust offer**

---

### Tenants
**Detection:** "tenant", "someone living there", "renter"

```
"Is that a formal lease situation? Do you know when the lease ends?"
```

```javascript
callContext.keyInfo.propertyIssues.hasTenants = true;
callContext.keyInfo.propertyIssues.tenantDetails = details;
```

---

## HANDLER: VULNERABLE_ADULT

**Detection Patterns:**
```javascript
const VULNERABLE_INDICATORS = [
  // Repeated confusion
  confusionCount >= 3,
  
  // Mentions of caregiver/guardian
  "my daughter handles",
  "my son takes care of",
  "my caregiver",
  "I don't understand these things",
  
  // Difficulty with technology
  "I don't know how to use",
  "I can't see the screen",
  "I can't hear you" // repeated
];
```

**Response:**
```
"I want to make sure you're completely comfortable with this conversation. Would you prefer to have a family member or someone you trust join us?"
```

**If multiple indicators:**
```
"You know what, I think it might be better if I sent some information to you in the mail instead. That way you can look it over with someone you trust at your own pace. What's the best mailing address?"
```

**CRITICAL:**
```javascript
// Do NOT proceed to contract with vulnerable adult
callContext.flags.push("VULNERABLE_ADULT_SUSPECTED");
callContext.blockContractSigning = true;
```

**Actions:**
- Flag for human review
- Do not pressure or proceed with contract
- Offer to involve family/trusted person
- Consider sending written materials instead

---

## HANDLER: COMPETITIVE_SITUATION

**Detection:** "another offer", "other investors", "realtor", "listed"

**If has competing offer:**
```
"That's great that you have options! Can I ask what you liked about their offer? Maybe we can do something similar or better."
```

**If listed with realtor:**
```
"I don't want to interfere with your listing agreement. When does your contract with the agent expire? We could potentially work together after that."
```

**If shopping:**
```
"I totally understand wanting to make sure you're getting a fair deal. Our offer is based on what properties are actually selling for. 

Just so you know, we're actively buying in {county} right now and our budget does get allocated. I'd hate for you to miss out. How much time do you need to make a decision?"
```

---

# 10. APPENDICES

## APPENDIX A: Emotion/Sentiment Detection

```javascript
const SENTIMENT_INDICATORS = {
  POSITIVE: {
    keywords: ["great", "sounds good", "perfect", "interested", "yes", "definitely"],
    tone: "enthusiastic, agreeable"
  },
  NEGATIVE: {
    keywords: ["no", "not interested", "don't", "can't", "won't"],
    tone: "dismissive, resistant"
  },
  HESITANT: {
    keywords: ["maybe", "not sure", "I don't know", "let me think"],
    tone: "uncertain, wavering"
  },
  HOSTILE: {
    keywords: ["scam", "fraud", "stop", "harassment", profanity],
    tone: "angry, aggressive"
  },
  CONFUSED: {
    keywords: ["what", "huh", "I don't understand", "what do you mean"],
    tone: "puzzled"
  },
  SAD: {
    keywords: ["passed away", "died", "difficult", "struggling"],
    tone: "somber, emotional"
  }
};
```

## APPENDIX B: Number Extraction

```javascript
function extractPrice(text) {
  // Handle various formats:
  // "$32,000", "32000", "32k", "32 thousand", "thirty-two thousand"
  
  const patterns = [
    /\$?([\d,]+)/,                    // $32,000 or 32000
    /(\d+)k/i,                        // 32k
    /(\d+)\s*thousand/i,              // 32 thousand
    /([a-z-]+)\s*thousand/i           // thirty-two thousand
  ];
  
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      return parseNumber(match[1]);
    }
  }
  
  return null;
}
```

## APPENDIX C: Date/Time Extraction

```javascript
function extractDateTime(text) {
  // Handle various formats:
  // "tomorrow at 2", "Tuesday afternoon", "next week", "in 3 days"
  
  const now = new Date();
  
  // Tomorrow
  if (/tomorrow/i.test(text)) {
    const date = addDays(now, 1);
    const time = extractTime(text) || "10:00";
    return combineDateTime(date, time);
  }
  
  // Day of week
  const dayMatch = text.match(/(monday|tuesday|wednesday|thursday|friday)/i);
  if (dayMatch) {
    const date = getNextWeekday(dayMatch[1]);
    const time = extractTime(text) || "10:00";
    return combineDateTime(date, time);
  }
  
  // Relative
  const relativeMatch = text.match(/in\s+(\d+)\s+(days?|weeks?)/i);
  if (relativeMatch) {
    const num = parseInt(relativeMatch[1]);
    const unit = relativeMatch[2].toLowerCase().replace('s', '');
    const date = unit === 'day' ? addDays(now, num) : addWeeks(now, num);
    return combineDateTime(date, "10:00");
  }
  
  return null;
}
```

## APPENDIX D: State-Specific Requirements

```javascript
const STATE_REQUIREMENTS = {
  "FL": {
    disclosureRequired: true,
    disclosure: "As a buyer, I'm required to inform you that I intend to make a profit on this transaction.",
    deliverAt: "before_offer"
  },
  "CA": {
    disclosureRequired: true,
    disclosure: "I'm a real estate investor, not a licensed real estate agent.",
    deliverAt: "before_offer"
  },
  "TX": {
    disclosureRequired: false
  },
  "AZ": {
    disclosureRequired: false
  }
  // Add more states as needed
};
```

## APPENDIX E: Webhook Payload Schemas

```javascript
const WEBHOOK_SCHEMAS = {
  
  "call_started": {
    callId: "string",
    leadId: "string",
    timestamp: "ISO8601",
    agentId: "string"
  },
  
  "call_ended": {
    callId: "string",
    leadId: "string",
    duration: "number (seconds)",
    outcome: "string",
    recordingUrl: "string",
    transcriptUrl: "string"
  },
  
  "appointment_booked": {
    leadId: "string",
    appointmentTime: "ISO8601",
    appointmentWith: "string",
    sellerEmail: "string",
    sellerPhone: "string",
    qualificationScore: "number",
    keyInfo: "object"
  },
  
  "contract_sent": {
    leadId: "string",
    envelopeId: "string",
    purchasePrice: "number",
    sellerEmail: "string",
    dealStructure: "string"
  },
  
  "deal_created": {
    leadId: "string",
    dealId: "string",
    purchasePrice: "number",
    closingDate: "ISO8601",
    sellerName: "string",
    propertyAddress: "string",
    // ... all deal details
  },
  
  "add_to_dnc": {
    phone: "string",
    leadId: "string",
    requestedAt: "ISO8601",
    source: "string"
  }
};
```

---

## DOCUMENT SUMMARY

This specification covers:

1. **32 distinct states** across Phases 1 and 2
2. **15+ global handlers** for edge cases
3. **100+ detection patterns** for intent classification
4. **Every possible branch** and transition
5. **Complete scripts** for every scenario
6. **Post-call automation** via webhooks
7. **Error handling** for system failures

**Total estimated conversation paths: 500+**

---

*End of Complete Call Flow Specification*
# LandVerse AI Agent - Note Taking System
## Complete Specification for Real-Time Call Documentation

---

# OVERVIEW

The AI agent must capture **comprehensive, structured notes** throughout every call. These notes serve multiple purposes:

1. **CRM Records** - Permanent documentation of the interaction
2. **Human Handoff** - Acquisition managers need full context
3. **Follow-up Calls** - Agent (AI or human) needs history on callbacks
4. **Contract Accuracy** - Verified data for legal documents
5. **Deal Pipeline** - Tracking motivation, blockers, and progress
6. **Analytics** - Understanding conversion patterns
7. **Compliance** - Record of disclosures and consent

**Philosophy:** Capture EVERYTHING. It's better to have too much information than too little. Notes should be so detailed that anyone reading them can understand exactly what happened and pick up where the call left off.

---

# NOTE STRUCTURE

## Master Notes Object

```javascript
const CallNotes = {
  // ═══════════════════════════════════════════════════════════════════
  // CALL METADATA
  // ═══════════════════════════════════════════════════════════════════
  metadata: {
    callId: "uuid",
    leadId: "uuid",
    callType: "COLD_CALL" | "SCHEDULED_APPOINTMENT" | "CALLBACK" | "FOLLOW_UP",
    agentId: "AI_AGENT_001",
    agentName: "Alex",
    startTime: "2024-01-15T14:32:00Z",
    endTime: "2024-01-15T14:47:23Z",
    duration: 923, // seconds
    outcome: "APPOINTMENT_SET" | "CONTRACT_SIGNED" | "CALLBACK_SCHEDULED" | etc,
    recordingUrl: "https://...",
    transcriptUrl: "https://..."
  },
  
  // ═══════════════════════════════════════════════════════════════════
  // CONTACT VERIFICATION
  // ═══════════════════════════════════════════════════════════════════
  contactVerification: {
    spokeWithOwner: true,
    ownerNameConfirmed: true,
    confirmedName: "John Smith",
    nameMatchesRecords: true,
    phoneNumberValid: true,
    wrongNumber: false,
    wrongPerson: false,
    deceased: false,
    deceasedDetails: null
  },
  
  // ═══════════════════════════════════════════════════════════════════
  // PROPERTY VERIFICATION
  // ═══════════════════════════════════════════════════════════════════
  propertyVerification: {
    ownershipConfirmed: true,
    propertyAddressConfirmed: true,
    acreageConfirmed: true,
    corrections: {
      // Any corrections to our data
      addressCorrection: null,
      acreageCorrection: null,
      apnCorrection: null
    }
  },
  
  // ═══════════════════════════════════════════════════════════════════
  // OWNERSHIP DETAILS
  // ═══════════════════════════════════════════════════════════════════
  ownership: {
    ownershipType: "SOLE" | "JOINT" | "TRUST" | "ESTATE" | "LLC" | "MULTIPLE_HEIRS",
    ownershipYears: 12,
    acquisitionMethod: "PURCHASE" | "INHERITED" | "GIFT" | "OTHER",
    acquisitionStory: "Bought it in 2012 planning to build a retirement home",
    
    // Co-owner details
    hasCoOwner: true,
    coOwner: {
      name: "Jane Smith",
      relation: "wife",
      isPresent: false,
      isAware: true,
      isAligned: "YES" | "NO" | "UNKNOWN" | "NEEDS_DISCUSSION",
      contactInfo: null
    },
    
    // Trust/Estate details (if applicable)
    trustDetails: {
      trustName: null,
      trusteeName: null,
      trusteeIsOwner: null
    },
    estateDetails: {
      deceasedName: null,
      executorName: null,
      probateStatus: null,
      probateComplete: null
    },
    
    // Multiple owners (if applicable)
    additionalOwners: [
      // { name: "Bob Smith", relation: "brother", aligned: "YES" }
    ],
    decisionMaker: {
      isSeller: true,
      name: "John Smith",
      hasAuthority: true
    }
  },
  
  // ═══════════════════════════════════════════════════════════════════
  // INTEREST & MOTIVATION
  // ═══════════════════════════════════════════════════════════════════
  interest: {
    // Initial response to opener
    initialResponse: "seemed interested, asked about price",
    initialInterestLevel: "WARM", // HOT, WARM, LUKEWARM, COLD, HOSTILE
    
    // Interest throughout call
    peakInterestLevel: "HOT",
    finalInterestLevel: "HOT",
    interestProgression: [
      { timestamp: "00:45", level: "WARM", trigger: "mentioned haven't used property" },
      { timestamp: "02:30", level: "HOT", trigger: "asked about our offer" },
      { timestamp: "08:15", level: "WARM", trigger: "hesitated on price" },
      { timestamp: "12:00", level: "HOT", trigger: "agreed to terms" }
    ],
    
    // Was seller already considering selling?
    wasConsideringSelling: true,
    considerationDuration: "about 6 months",
    
    // What triggered consideration?
    triggerEvent: "Got tax bill in November, realized he's paying $1,200/year for land he never visits",
    
    // Hot trigger phrases detected
    hotTriggers: [
      { phrase: "I've been thinking about selling", timestamp: "01:23" },
      { phrase: "what would you pay for it", timestamp: "02:45" }
    ]
  },
  
  // ═══════════════════════════════════════════════════════════════════
  // MOTIVATION ANALYSIS
  // ═══════════════════════════════════════════════════════════════════
  motivation: {
    primaryMotivation: "TAX_BURDEN",
    secondaryMotivation: "DISTANCE",
    motivationStrength: "STRONG", // STRONG, MODERATE, WEAK
    
    // Detailed motivation notes
    motivationDetails: {
      financial: {
        detected: false,
        details: null
      },
      taxBurden: {
        detected: true,
        annualTaxes: 1200,
        details: "Paying $1,200/year in taxes for land he never uses, called it 'throwing money away'"
      },
      divorce: {
        detected: false,
        details: null
      },
      death: {
        detected: false,
        details: null
      },
      relocation: {
        detected: true,
        details: "Lives in Arizona now, property is in Texas, hasn't visited in 3 years"
      },
      tired: {
        detected: true,
        details: "Said he's 'tired of dealing with it' and 'just want it off my plate'"
      },
      health: {
        detected: false,
        details: null
      },
      retirement: {
        detected: true,
        details: "Originally bought for retirement home but changed plans, now retiring in Arizona instead"
      }
    },
    
    // Emotional anchor (for negotiation leverage)
    emotionalAnchor: "Wants to stop wasting money on taxes and finally close this chapter of his life",
    
    // What seller wants to do with proceeds
    proceedsPlans: "Add to retirement savings, maybe take wife on a cruise"
  },
  
  // ═══════════════════════════════════════════════════════════════════
  // TIMELINE & URGENCY
  // ═══════════════════════════════════════════════════════════════════
  timeline: {
    urgency: "MODERATE", // URGENT, FAST, MODERATE, FLEXIBLE, NO_RUSH
    preferredTimeline: "60-90 days",
    
    // Specific dates/deadlines mentioned
    hardDeadlines: null,
    softPreferences: "Would like to have it done before summer",
    
    // Timing blockers
    timingBlockers: null,
    
    // Notes
    timelineNotes: "No hard deadline but would prefer sooner rather than later. Tax bill due in October so closing before then would be ideal."
  },
  
  // ═══════════════════════════════════════════════════════════════════
  // PRICE DISCUSSION
  // ═══════════════════════════════════════════════════════════════════
  pricing: {
    // Our offer details
    ourInitialOffer: 28000,
    ourFinalOffer: 32000,
    offerRangeLow: 28000,
    offerRangeHigh: 35000,
    ourMaxAuthority: 38000,
    
    // Seller's expectations
    sellerInitialAsk: 45000,
    sellerFinalAsk: 35000,
    sellerPriceReasoning: "Based on what a neighbor got 2 years ago for similar acreage",
    
    // Price discussion notes
    priceDiscussion: [
      { timestamp: "05:30", event: "Presented range $28K-$35K", sellerReaction: "Said he was hoping for more" },
      { timestamp: "06:15", event: "Seller said he wants $45K", agentResponse: "Asked how he arrived at that" },
      { timestamp: "07:00", event: "Seller explained neighbor comparison", agentResponse: "Acknowledged, explained market changes" },
      { timestamp: "09:30", event: "Seller came down to $40K", agentResponse: "Offered $30K" },
      { timestamp: "11:00", event: "Agreed on $32K with 60-day close", sellerReaction: "Accepted" }
    ],
    
    // Final agreement
    agreedPrice: 32000,
    priceAgreed: true,
    
    // Deal structure
    dealStructure: "STANDARD", // STANDARD or DOUBLE_CLOSE
    closingDays: 60,
    closingDate: "2024-03-15"
  },
  
  // ═══════════════════════════════════════════════════════════════════
  // PROPERTY DETAILS & ISSUES
  // ═══════════════════════════════════════════════════════════════════
  property: {
    // From lead data (verified/corrected)
    address: "123 Rural Road, Hill County, TX",
    acreage: 10.5,
    county: "Hill",
    state: "TX",
    apn: "12345-67-890",
    
    // Property characteristics mentioned
    characteristics: {
      terrain: "Mostly flat with some trees",
      roadAccess: "Dirt road, county maintained",
      utilities: "Electric at road, no water/sewer",
      structures: "None",
      fencing: "Partial fencing on two sides",
      waterFeatures: null,
      otherFeatures: "Nice views of hills"
    },
    
    // Property history
    propertyHistory: {
      originalPlans: "Build retirement home",
      whyPlansChanged: "Decided to retire in Arizona instead where kids live",
      everUsed: "Camped on it a few times years ago",
      lastVisited: "About 3 years ago",
      currentUse: "Vacant, unused"
    },
    
    // Issues disclosed
    issues: {
      hasIssues: true,
      issuesList: [
        {
          type: "BACK_TAXES",
          details: "None - taxes current",
          amount: null,
          impact: "NONE"
        },
        {
          type: "ACCESS",
          details: "Legal access via county road",
          amount: null,
          impact: "NONE"
        },
        {
          type: "LIENS",
          details: "None known",
          amount: null,
          impact: "NONE"
        }
      ],
      issuesSummary: "No significant issues disclosed. Taxes current, legal access, no liens."
    },
    
    // Seller's knowledge of property
    sellerKnowledgeLevel: "MODERATE", // HIGH, MODERATE, LOW
    sellerKnowledgeNotes: "Knows the basics but hasn't visited recently. May not be aware of current conditions."
  },
  
  // ═══════════════════════════════════════════════════════════════════
  // COMPETITIVE SITUATION
  // ═══════════════════════════════════════════════════════════════════
  competition: {
    hasCompetition: true,
    competitionType: "PRIOR_OFFERS", // CURRENT_OFFER, PRIOR_OFFERS, LISTED, NONE
    
    // Other offers
    otherOffers: [
      {
        when: "About 6 months ago",
        from: "Some investor, don't remember the name",
        amount: "Around $25,000",
        whyRejected: "Felt it was too low at the time",
        notes: "Seller now thinks he should have taken it"
      }
    ],
    
    // Currently listed?
    currentlyListed: false,
    listingDetails: null,
    realtorName: null,
    listingExpiration: null,
    
    // Shopping the offer?
    isShopping: false,
    shoppingNotes: null
  },
  
  // ═══════════════════════════════════════════════════════════════════
  // OBJECTIONS ENCOUNTERED
  // ═══════════════════════════════════════════════════════════════════
  objections: {
    totalObjections: 3,
    objectionsList: [
      {
        timestamp: "01:15",
        type: "INITIAL_RESISTANCE",
        objection: "I'm not really looking to sell right now",
        response: "Asked what would have to happen for him to consider selling",
        outcome: "OVERCOME",
        notes: "Opened up about tax burden frustration"
      },
      {
        timestamp: "06:30",
        type: "PRICE",
        objection: "That's lower than I was hoping for",
        response: "Asked about his expectations and reasoning",
        outcome: "OVERCOME",
        notes: "Used emotional anchor about taxes, eventually agreed"
      },
      {
        timestamp: "10:45",
        type: "TIMING",
        objection: "I need to talk to my wife first",
        response: "Asked if wife was available, offered to include her",
        outcome: "RESOLVED",
        notes: "Said wife already knows he wants to sell, will sign when he does"
      }
    ],
    unresolvedObjections: [],
    objectionsOvercome: 3
  },
  
  // ═══════════════════════════════════════════════════════════════════
  // CONTRACT DETAILS (if applicable)
  // ═══════════════════════════════════════════════════════════════════
  contract: {
    contractGenerated: true,
    contractSent: true,
    contractSentAt: "2024-01-15T14:42:00Z",
    contractSentTo: "john.smith@email.com",
    docusignEnvelopeId: "abc-123-def-456",
    
    // Contract data collected
    contractData: {
      sellerLegalName: "John Robert Smith",
      sellerMailingAddress: "456 Desert View Dr, Phoenix, AZ 85001",
      sellerEmail: "john.smith@email.com",
      sellerPhone: "+15551234567",
      
      // Co-owner on contract
      coOwnerLegalName: "Jane Marie Smith",
      
      // Property
      propertyAddress: "123 Rural Road, Hill County, TX",
      propertyAPN: "12345-67-890",
      acreage: 10.5,
      
      // Terms
      purchasePrice: 32000,
      earnestMoney: 320,
      closingDate: "2024-03-15",
      dueDiligenceDays: 14
    },
    
    // Walkthrough notes
    walkthroughCompleted: true,
    walkthroughNotes: [
      "Seller found email quickly, no spam issues",
      "Confirmed all seller info correct",
      "Confirmed property details correct",
      "Confirmed price of $32,000",
      "Asked about 'what if you back out' - explained DD process",
      "Signed without further objection"
    ],
    
    // Signature
    signatureReceived: true,
    signatureReceivedAt: "2024-01-15T14:45:30Z",
    signatureMethod: "DOCUSIGN_ELECTRONIC",
    
    // Post-signature
    confirmationSent: true,
    titleCompanyNotified: true
  },
  
  // ═══════════════════════════════════════════════════════════════════
  // APPOINTMENT DETAILS (if applicable)
  // ═══════════════════════════════════════════════════════════════════
  appointment: {
    appointmentScheduled: false,
    appointmentDateTime: null,
    appointmentWith: null,
    appointmentType: null, // "PHONE" | "VIDEO" | "IN_PERSON"
    calendarInviteSent: null,
    confirmationMethod: null, // "EMAIL" | "SMS" | "BOTH"
    appointmentNotes: null
  },
  
  // ═══════════════════════════════════════════════════════════════════
  // CALLBACK DETAILS (if applicable)
  // ═══════════════════════════════════════════════════════════════════
  callback: {
    callbackScheduled: false,
    callbackDateTime: null,
    callbackReason: null,
    callbackPriority: null, // "HOT" | "WARM" | "STANDARD"
    callbackNotes: null,
    callbackWith: null // "AI" | "HUMAN" | specific person
  },
  
  // ═══════════════════════════════════════════════════════════════════
  // COMPLIANCE & DISCLOSURES
  // ═══════════════════════════════════════════════════════════════════
  compliance: {
    recordingDisclosure: {
      required: true,
      delivered: true,
      timestamp: "00:03",
      sellerResponse: "ACCEPTED"
    },
    stateDisclosure: {
      required: true,
      state: "TX",
      delivered: true,
      timestamp: "05:25",
      disclosureText: "I'm required to inform you that I intend to make a profit on this transaction"
    },
    dncRequested: false,
    dncTimestamp: null
  },
  
  // ═══════════════════════════════════════════════════════════════════
  // SELLER PROFILE
  // ═══════════════════════════════════════════════════════════════════
  sellerProfile: {
    // Communication style
    communicationStyle: "CONVERSATIONAL", // DIRECT, CONVERSATIONAL, DETAILED, BRIEF
    pace: "NORMAL", // FAST, NORMAL, SLOW
    
    // Personality observations
    personality: {
      decisionStyle: "DELIBERATE", // QUICK, DELIBERATE, INDECISIVE
      trustLevel: "MODERATE", // HIGH, MODERATE, LOW, SKEPTICAL
      emotionalState: "CALM", // CALM, ANXIOUS, FRUSTRATED, EXCITED
      professionalLevel: "CASUAL" // PROFESSIONAL, CASUAL, INFORMAL
    },
    
    // Background info shared
    backgroundInfo: {
      occupation: "Retired, former engineer",
      location: "Phoenix, Arizona",
      family: "Wife Jane, two adult children in Arizona",
      interests: "Mentioned golf and grandkids",
      otherProperties: "Just their home in Phoenix"
    },
    
    // Rapport notes
    rapportNotes: "Easy to talk to, appreciated directness. Seemed relieved to finally have a real offer. Mentioned he's been meaning to deal with this property for years."
  },
  
  // ═══════════════════════════════════════════════════════════════════
  // VERBATIM QUOTES
  // ═══════════════════════════════════════════════════════════════════
  verbatimQuotes: [
    {
      timestamp: "02:15",
      quote: "I've been paying taxes on this thing for 12 years and I've used it maybe three times",
      context: "Expressing frustration with property",
      significance: "MOTIVATION"
    },
    {
      timestamp: "04:30",
      quote: "My wife and I decided we want to be near the grandkids, so Arizona is home now",
      context: "Explaining why original plans changed",
      significance: "MOTIVATION"
    },
    {
      timestamp: "07:15",
      quote: "My neighbor got $45,000 for his 10 acres a couple years back",
      context: "Explaining price expectation",
      significance: "PRICE_ANCHOR"
    },
    {
      timestamp: "11:30",
      quote: "You know what, let's just do this. I'm tired of thinking about it",
      context: "Agreeing to move forward",
      significance: "DECISION_MOMENT"
    }
  ],
  
  // ═══════════════════════════════════════════════════════════════════
  // FLAGS & ALERTS
  // ═══════════════════════════════════════════════════════════════════
  flags: {
    redFlags: [],
    yellowFlags: [
      "Co-owner (wife) not present on call - need both signatures"
    ],
    greenFlags: [
      "Strong motivation (tax burden + distance)",
      "Flexible timeline",
      "No competing offers",
      "Decision maker confirmed",
      "Price within our range"
    ],
    alerts: [],
    requiresHumanReview: false,
    reviewReason: null
  },
  
  // ═══════════════════════════════════════════════════════════════════
  // FOLLOW-UP REQUIREMENTS
  // ═══════════════════════════════════════════════════════════════════
  followUp: {
    immediateActions: [
      "Send contract confirmation email",
      "Notify title company",
      "Create deal in CRM"
    ],
    scheduledFollowUps: [
      { date: "2024-01-22", action: "Week 1 check-in call", assignedTo: "AI" },
      { date: "2024-01-29", action: "Week 2 update SMS", assignedTo: "SYSTEM" },
      { date: "2024-02-05", action: "Week 3 check-in call", assignedTo: "AI" },
      { date: "2024-03-12", action: "Pre-closing prep call", assignedTo: "HUMAN" }
    ],
    pendingItems: [
      "Wife Jane needs to sign contract via DocuSign"
    ]
  },
  
  // ═══════════════════════════════════════════════════════════════════
  // AGENT OBSERVATIONS & RECOMMENDATIONS
  // ═══════════════════════════════════════════════════════════════════
  agentNotes: {
    callSummary: "Strong call with motivated seller. John is a retired engineer who bought 10.5 acres in Hill County, TX in 2012 planning to build a retirement home. Plans changed when they decided to retire in Arizona to be near grandkids. He's been paying $1,200/year in taxes on property he never uses and was receptive to selling. After some negotiation around price (he wanted $45K based on a neighbor's sale, we agreed on $32K), he signed the contract on the call. Wife Jane wasn't present but he confirmed she's aligned and will sign. Easy to work with, appreciated our direct approach.",
    
    dealQuality: "GOOD", // EXCELLENT, GOOD, FAIR, MARGINAL
    dealQualityNotes: "Solid deal at $32K for 10.5 acres (~$3,050/acre). Motivated seller with no issues. Only yellow flag is wife needs to sign separately.",
    
    recommendations: [
      "Follow up with Jane to ensure she signs promptly",
      "Consider this seller for referrals - he mentioned neighbors also have land",
      "Fast-track title work if possible - seller is motivated"
    ],
    
    lessonsLearned: [
      "Tax burden angle was very effective",
      "Neighbor comp objection overcome by focusing on motivation vs price"
    ]
  },
  
  // ═══════════════════════════════════════════════════════════════════
  // QUALIFICATION SCORING
  // ═══════════════════════════════════════════════════════════════════
  scoring: {
    qualificationScore: 78, // 0-100
    
    scoreBreakdown: {
      interestLevel: 25, // max 30
      decisionMakerAuthority: 10, // max 10
      noCompetingOffers: 5, // max 5
      timelineUrgency: 8, // max 15
      motivationStrength: 18, // max 20
      priceAlignment: 12 // max 20
    },
    
    leadGrade: "A", // A, B, C, D, F
    
    conversionProbability: 95, // percentage
    conversionNotes: "Contract signed - very high probability of closing"
  }
};
```

---

# NOTE-TAKING BEHAVIOR BY STATE

## How Notes Are Captured at Each State

### INIT
```javascript
// Initialize notes structure
notes.metadata.callId = generateCallId();
notes.metadata.leadId = lead.id;
notes.metadata.startTime = new Date().toISOString();
notes.metadata.callType = determineCallType();
notes.metadata.agentName = CONFIG.agentName;
```

### RECORDING_DISCLOSURE
```javascript
notes.compliance.recordingDisclosure.required = isRecordingConsentRequired();
notes.compliance.recordingDisclosure.delivered = true;
notes.compliance.recordingDisclosure.timestamp = getCallTimestamp();
notes.compliance.recordingDisclosure.sellerResponse = detectResponse();
```

### P1_OPENING
```javascript
// Capture initial response
notes.interest.initialResponse = sellerResponse;
notes.interest.initialInterestLevel = classifyInterestLevel(sellerResponse);

// Log any hot triggers
if (detectHotTrigger(sellerResponse)) {
  notes.interest.hotTriggers.push({
    phrase: detectedPhrase,
    timestamp: getCallTimestamp()
  });
}
```

### P1_CONFIRM_OWNER
```javascript
notes.contactVerification.spokeWithOwner = true;
notes.contactVerification.ownerNameConfirmed = confirmed;
notes.contactVerification.confirmedName = extractedName;

notes.propertyVerification.ownershipConfirmed = confirmed;
```

### P1_COOWNER_CHECK
```javascript
notes.ownership.hasCoOwner = true;
notes.ownership.coOwner.name = extractedName;
notes.ownership.coOwner.relation = extractedRelation;
notes.ownership.coOwner.isPresent = isPresent;
notes.ownership.coOwner.isAware = isAware;
notes.ownership.coOwner.isAligned = alignmentStatus;
```

### P1_QUALIFYING - Question by Question

**Ownership Duration:**
```javascript
notes.ownership.ownershipYears = extractedYears;

// Capture the story
notes.property.propertyHistory.originalPlans = sellerResponse;
notes.ownership.acquisitionStory = sellerResponse;

// Log verbatim if significant
if (containsMotivationClue(sellerResponse)) {
  notes.verbatimQuotes.push({
    timestamp: getCallTimestamp(),
    quote: sellerResponse,
    context: "Discussing ownership history",
    significance: "MOTIVATION"
  });
}
```

**Decision Makers:**
```javascript
notes.ownership.decisionMaker.isSeller = isSoleDecisionMaker;
notes.ownership.decisionMaker.hasAuthority = hasAuthority;

if (!isSoleDecisionMaker) {
  notes.flags.yellowFlags.push(`Other decision maker: ${otherPerson}`);
}
```

**Other Offers:**
```javascript
notes.competition.hasCompetition = hasOffers;
notes.competition.competitionType = offerType;

if (hasOffers) {
  notes.competition.otherOffers.push({
    when: extractedTimeframe,
    from: extractedSource,
    amount: extractedAmount,
    whyRejected: extractedReason,
    notes: additionalContext
  });
}
```

**Timeline:**
```javascript
notes.timeline.urgency = classifyUrgency(sellerResponse);
notes.timeline.preferredTimeline = extractedTimeline;
notes.timeline.timelineNotes = sellerResponse;

// Capture any deadlines
if (mentionsDeadline(sellerResponse)) {
  notes.timeline.hardDeadlines = extractedDeadline;
}
```

**Price Expectation:**
```javascript
notes.pricing.sellerInitialAsk = extractedPrice;
notes.pricing.sellerPriceReasoning = extractedReasoning;

notes.priceDiscussion.push({
  timestamp: getCallTimestamp(),
  event: "Seller shared price expectation",
  sellerReaction: sellerResponse
});
```

### P2_PAST_QUESTIONS
```javascript
// Capture acquisition story
notes.ownership.acquisitionMethod = detectAcquisitionMethod(sellerResponse);
notes.ownership.acquisitionStory = sellerResponse;

// Property history
notes.property.propertyHistory.originalPlans = extractedPlans;
notes.property.propertyHistory.whyPlansChanged = extractedReason;

// Look for emotional content
if (containsEmotionalContent(sellerResponse)) {
  notes.verbatimQuotes.push({
    timestamp: getCallTimestamp(),
    quote: extractRelevantQuote(sellerResponse),
    context: "Discussing property history",
    significance: "EMOTIONAL"
  });
}
```

### P2_PRESENT_QUESTIONS
```javascript
notes.interest.wasConsideringSelling = wasConsidering;
notes.interest.considerationDuration = duration;
notes.interest.triggerEvent = triggerEvent;

// This is often the most important capture
notes.motivation.primaryMotivation = detectPrimaryMotivation(triggerEvent);
notes.motivation.motivationDetails[motivationType].detected = true;
notes.motivation.motivationDetails[motivationType].details = triggerEvent;
```

### P2_FUTURE_QUESTIONS
```javascript
// Capture their vision - critical for negotiation
notes.motivation.emotionalAnchor = sellerResponse;
notes.motivation.proceedsPlans = extractedPlans;

// Always quote this response
notes.verbatimQuotes.push({
  timestamp: getCallTimestamp(),
  quote: sellerResponse,
  context: "Describing what sale would mean to them",
  significance: "EMOTIONAL_ANCHOR"
});
```

### P2_DEAL_KILLERS
```javascript
// Partner alignment
if (needsPartnerApproval) {
  notes.ownership.coOwner.isAligned = alignmentStatus;
  notes.flags.yellowFlags.push(`Co-owner approval needed: ${partnerName}`);
}

// Timing blockers
if (hasTimingBlocker) {
  notes.timeline.timingBlockers = blockerDetails;
  notes.flags.yellowFlags.push(`Timing blocker: ${blockerDetails}`);
}
```

### P2_OFFER_TRANSITION
```javascript
notes.pricing.ourInitialOffer = presentedOffer;
notes.pricing.offerRangeLow = rangeLow;
notes.pricing.offerRangeHigh = rangeHigh;

notes.priceDiscussion.push({
  timestamp: getCallTimestamp(),
  event: `Presented offer range: ${rangeLow} - ${rangeHigh}`,
  sellerReaction: sellerResponse
});
```

### P2_NEGOTIATION
```javascript
// Log every price exchange
notes.priceDiscussion.push({
  timestamp: getCallTimestamp(),
  event: negotiationEvent,
  sellerReaction: sellerReaction,
  agentResponse: agentResponse
});

// Track counter offers
if (isCounterOffer) {
  notes.pricing.sellerFinalAsk = counterAmount;
}

if (isOurCounter) {
  notes.pricing.ourFinalOffer = ourAmount;
}
```

### P2_CONFIRM_AGREEMENT
```javascript
notes.pricing.agreedPrice = agreedPrice;
notes.pricing.priceAgreed = true;
notes.pricing.dealStructure = dealStructure;
notes.pricing.closingDays = closingDays;
notes.pricing.closingDate = calculateClosingDate();

// Log the agreement moment
notes.verbatimQuotes.push({
  timestamp: getCallTimestamp(),
  quote: sellerAgreementStatement,
  context: "Agreeing to terms",
  significance: "DECISION_MOMENT"
});
```

### P2_COLLECT_CONTRACT_DATA
```javascript
// Capture all contract data
notes.contract.contractData.sellerLegalName = collectedName;
notes.contract.contractData.sellerMailingAddress = collectedAddress;
notes.contract.contractData.sellerEmail = collectedEmail;

// Note any corrections
if (nameCorrection) {
  notes.propertyVerification.corrections.push({
    field: "sellerName",
    original: leadData.name,
    corrected: collectedName
  });
}
```

### P2_CONTRACT_WALKTHROUGH
```javascript
notes.contract.walkthroughCompleted = true;

// Log each step
notes.contract.walkthroughNotes.push(`Email found: ${emailFoundStatus}`);
notes.contract.walkthroughNotes.push(`Seller info confirmed: ${sellerInfoStatus}`);
notes.contract.walkthroughNotes.push(`Property info confirmed: ${propertyInfoStatus}`);
notes.contract.walkthroughNotes.push(`Price confirmed: ${priceStatus}`);

// Capture any questions/concerns
if (sellerQuestion) {
  notes.contract.walkthroughNotes.push(`Question: ${sellerQuestion} - Response: ${agentResponse}`);
}
```

### P2_POST_SIGNATURE
```javascript
notes.contract.signatureReceived = true;
notes.contract.signatureReceivedAt = new Date().toISOString();
notes.contract.confirmationSent = true;
notes.contract.titleCompanyNotified = true;

// Set follow-ups
notes.followUp.scheduledFollowUps = generateFollowUpSchedule();
```

### OBJECTION HANDLING (Global)
```javascript
// Called whenever an objection is encountered
function logObjection(objectionType, objection, response, outcome) {
  notes.objections.totalObjections++;
  notes.objections.objectionsList.push({
    timestamp: getCallTimestamp(),
    type: objectionType,
    objection: objection,
    response: response,
    outcome: outcome,
    notes: additionalContext
  });
  
  if (outcome !== "OVERCOME" && outcome !== "RESOLVED") {
    notes.objections.unresolvedObjections.push(objection);
  } else {
    notes.objections.objectionsOvercome++;
  }
}
```

---

# REAL-TIME NOTE GENERATION

## Live Transcript → Notes Extraction

As the conversation happens, the AI continuously extracts and structures notes:

```javascript
async function processTranscriptChunk(newText, speaker) {
  // Add to full transcript
  callContext.transcript += `\n[${speaker}]: ${newText}`;
  
  // ═══════════════════════════════════════════════════════════════════
  // EXTRACT KEY INFORMATION
  // ═══════════════════════════════════════════════════════════════════
  
  // 1. Check for hot triggers
  const hotTrigger = detectHotTrigger(newText);
  if (hotTrigger) {
    notes.interest.hotTriggers.push({
      phrase: hotTrigger,
      timestamp: getCallTimestamp()
    });
    notes.interest.peakInterestLevel = "HOT";
  }
  
  // 2. Check for motivation indicators
  const motivation = detectMotivation(newText);
  if (motivation) {
    notes.motivation.motivationDetails[motivation.type].detected = true;
    notes.motivation.motivationDetails[motivation.type].details = newText;
    if (!notes.motivation.primaryMotivation) {
      notes.motivation.primaryMotivation = motivation.type;
    }
  }
  
  // 3. Extract prices mentioned
  const price = extractPrice(newText);
  if (price && speaker === "SELLER") {
    // Log price mention
    notes.priceDiscussion.push({
      timestamp: getCallTimestamp(),
      event: `Seller mentioned price: ${price}`,
      sellerReaction: newText
    });
  }
  
  // 4. Check for objections
  const objection = detectObjection(newText);
  if (objection && speaker === "SELLER") {
    // Will be fully logged when handled
    callContext.pendingObjection = objection;
  }
  
  // 5. Check for property issues
  const propertyIssue = detectPropertyIssue(newText);
  if (propertyIssue) {
    notes.property.issues.hasIssues = true;
    notes.property.issues.issuesList.push({
      type: propertyIssue.type,
      details: newText,
      impact: assessImpact(propertyIssue)
    });
  }
  
  // 6. Check for significant quotes
  if (isSignificantStatement(newText)) {
    notes.verbatimQuotes.push({
      timestamp: getCallTimestamp(),
      quote: newText,
      context: callContext.currentState,
      significance: determineSignificance(newText)
    });
  }
  
  // 7. Update interest level tracking
  const interestSignal = detectInterestLevel(newText);
  if (interestSignal) {
    notes.interest.interestProgression.push({
      timestamp: getCallTimestamp(),
      level: interestSignal.level,
      trigger: newText.substring(0, 50) + "..."
    });
    notes.interest.finalInterestLevel = interestSignal.level;
  }
  
  // 8. Check for DNC request
  if (detectDNCRequest(newText)) {
    notes.compliance.dncRequested = true;
    notes.compliance.dncTimestamp = getCallTimestamp();
  }
  
  // 9. Extract any co-owner mentions
  const coOwnerMention = detectCoOwnerMention(newText);
  if (coOwnerMention) {
    notes.ownership.hasCoOwner = true;
    if (coOwnerMention.name) notes.ownership.coOwner.name = coOwnerMention.name;
    if (coOwnerMention.relation) notes.ownership.coOwner.relation = coOwnerMention.relation;
  }
  
  // 10. Profile building
  const profileInfo = extractProfileInfo(newText);
  if (profileInfo) {
    Object.assign(notes.sellerProfile.backgroundInfo, profileInfo);
  }
}
```

---

# NOTE TEMPLATES BY OUTCOME

## Template: Appointment Set

```javascript
const appointmentSetTemplate = {
  callSummary: `Spoke with {sellerName} about their {acreage} acres in {county} County. {interestSummary}. {motivationSummary}. Scheduled appointment with {appointmentWith} for {appointmentDateTime}. {keyTakeaways}.`,
  
  example: "Spoke with John Smith about their 10.5 acres in Hill County. He showed moderate interest after discussing the tax burden he's been experiencing ($1,200/year). Main motivation is the property is too far from his current home in Arizona. Scheduled appointment with Jordan for Tuesday 1/16 at 2:00 PM. Key takeaway: expects around $45K based on neighbor comp, we can likely do $28-35K."
};
```

## Template: Contract Signed

```javascript
const contractSignedTemplate = {
  callSummary: `Closed deal with {sellerName} for {acreage} acres in {county} County at {agreedPrice}. {acquisitionStory}. {motivationSummary}. {negotiationSummary}. Contract signed via DocuSign. Closing scheduled for {closingDate}. {pendingItems}.`,
  
  example: "Closed deal with John Smith for 10.5 acres in Hill County, TX at $32,000. Property was purchased in 2012 for retirement home that never happened - now retiring in Arizona instead. Primary motivation was tax burden ($1,200/year) and distance (hasn't visited in 3 years). Negotiated down from his ask of $45K using emotional anchor about finally closing this chapter. Contract signed via DocuSign. Closing scheduled for March 15, 2024. Pending: Wife Jane needs to sign contract."
};
```

## Template: Callback Scheduled

```javascript
const callbackTemplate = {
  callSummary: `Spoke with {sellerName} about their {acreage} acres in {county} County. {interestLevel}. {reasonForCallback}. Callback scheduled for {callbackDateTime}. {preparationNotes}.`,
  
  example: "Spoke with John Smith about their 10.5 acres in Hill County. Warm interest - asked about price but wife wasn't available to discuss. Need to include both decision makers. Callback scheduled for Thursday 1/18 at 6:00 PM when both will be home. Prepare with offer range $28-35K, have co-owner contract template ready."
};
```

## Template: No Interest

```javascript
const noInterestTemplate = {
  callSummary: `Spoke with {sellerName} about their {acreage} acres in {county} County. {rejectionReason}. {attemptsSummary}. {futureFollowUp}.`,
  
  example: "Spoke with John Smith about their 10.5 acres in Hill County. Not interested - has plans to pass property to children. Made 3 attempts to uncover motivation but firm on keeping for family. Follow up in 6 months to check if situation has changed."
};
```

---

# NOTE EXPORT FORMATS

## CRM Format (Salesforce/HubSpot)

```javascript
function formatForCRM(notes) {
  return {
    // Standard CRM fields
    leadId: notes.metadata.leadId,
    contactName: notes.contactVerification.confirmedName,
    lastContactDate: notes.metadata.startTime,
    lastContactType: "Phone - Outbound",
    lastContactOutcome: notes.metadata.outcome,
    
    // Custom fields
    interestLevel: notes.interest.finalInterestLevel,
    qualificationScore: notes.scoring.qualificationScore,
    motivationType: notes.motivation.primaryMotivation,
    priceExpectation: notes.pricing.sellerInitialAsk,
    agreedPrice: notes.pricing.agreedPrice,
    timeline: notes.timeline.preferredTimeline,
    hasCoOwner: notes.ownership.hasCoOwner,
    
    // Notes field (structured summary)
    notes: generateCRMNotes(notes),
    
    // Next action
    nextActionDate: notes.followUp.scheduledFollowUps[0]?.date,
    nextAction: notes.followUp.scheduledFollowUps[0]?.action
  };
}

function generateCRMNotes(notes) {
  return `
CALL SUMMARY: ${notes.agentNotes.callSummary}

MOTIVATION: ${notes.motivation.primaryMotivation} - ${notes.motivation.emotionalAnchor}

PRICING:
- Seller Ask: ${formatCurrency(notes.pricing.sellerInitialAsk)}
- Our Max: ${formatCurrency(notes.pricing.ourMaxAuthority)}
- Agreed: ${formatCurrency(notes.pricing.agreedPrice)}

TIMELINE: ${notes.timeline.preferredTimeline} (${notes.timeline.urgency})

CO-OWNER: ${notes.ownership.hasCoOwner ? notes.ownership.coOwner.name + ' (' + notes.ownership.coOwner.relation + ') - ' + notes.ownership.coOwner.isAligned : 'None'}

FLAGS:
${notes.flags.yellowFlags.map(f => '⚠️ ' + f).join('\n')}
${notes.flags.greenFlags.map(f => '✅ ' + f).join('\n')}

KEY QUOTES:
${notes.verbatimQuotes.map(q => '"' + q.quote + '"').join('\n')}

RECORDING: ${notes.metadata.recordingUrl}
  `.trim();
}
```

## Handoff Format (for Human Acquisition Manager)

```javascript
function formatForHandoff(notes) {
  return `
═══════════════════════════════════════════════════════════════════
LEAD HANDOFF: ${notes.contactVerification.confirmedName}
Property: ${notes.property.acreage} acres in ${notes.property.county} County, ${notes.property.state}
═══════════════════════════════════════════════════════════════════

📞 CONTACT INFO:
   Name: ${notes.contactVerification.confirmedName}
   Phone: ${notes.metadata.leadId} // Get from lead record
   Email: ${notes.contract.contractData?.sellerEmail || 'Not collected'}

🏠 PROPERTY:
   Address: ${notes.property.address}
   Acreage: ${notes.property.acreage}
   APN: ${notes.property.apn}
   Issues: ${notes.property.issues.issuesSummary}

💰 PRICING:
   Seller Expects: ${formatCurrency(notes.pricing.sellerInitialAsk)}
   Our Range: ${formatCurrency(notes.pricing.offerRangeLow)} - ${formatCurrency(notes.pricing.offerRangeHigh)}
   Max Authority: ${formatCurrency(notes.pricing.ourMaxAuthority)}
   
📊 QUALIFICATION:
   Score: ${notes.scoring.qualificationScore}/100 (Grade: ${notes.scoring.leadGrade})
   Interest: ${notes.interest.finalInterestLevel}
   
🎯 MOTIVATION:
   Primary: ${notes.motivation.primaryMotivation}
   Details: ${notes.motivation.motivationDetails[notes.motivation.primaryMotivation]?.details}
   Emotional Anchor: "${notes.motivation.emotionalAnchor}"
   
   USE THIS IN NEGOTIATION: "You mentioned ${notes.motivation.emotionalAnchor}..."

👥 DECISION MAKERS:
   Seller: ${notes.ownership.decisionMaker.name} ${notes.ownership.decisionMaker.hasAuthority ? '(Has authority)' : '(Needs approval)'}
   Co-Owner: ${notes.ownership.hasCoOwner ? notes.ownership.coOwner.name + ' (' + notes.ownership.coOwner.relation + ')' : 'None'}
   Co-Owner Aligned: ${notes.ownership.coOwner?.isAligned || 'N/A'}

⏰ TIMELINE:
   Urgency: ${notes.timeline.urgency}
   Preferred: ${notes.timeline.preferredTimeline}
   Notes: ${notes.timeline.timelineNotes}

🚧 OBJECTIONS ENCOUNTERED:
${notes.objections.objectionsList.map(o => `   - "${o.objection}" → ${o.outcome}`).join('\n')}

💬 KEY QUOTES:
${notes.verbatimQuotes.map(q => `   "${q.quote}" (${q.significance})`).join('\n')}

⚠️ FLAGS TO WATCH:
${notes.flags.yellowFlags.map(f => `   ⚠️ ${f}`).join('\n')}

✅ GREEN FLAGS:
${notes.flags.greenFlags.map(f => `   ✅ ${f}`).join('\n')}

📋 RECOMMENDED APPROACH:
${notes.agentNotes.recommendations.map(r => `   • ${r}`).join('\n')}

📝 FULL SUMMARY:
${notes.agentNotes.callSummary}

🎧 RECORDING: ${notes.metadata.recordingUrl}
═══════════════════════════════════════════════════════════════════
  `;
}
```

## Slack Notification Format

```javascript
function formatForSlack(notes) {
  const emoji = {
    "CONTRACT_SIGNED": "🎉",
    "APPOINTMENT_SET": "📅",
    "CALLBACK_SCHEDULED": "📞",
    "NOT_INTERESTED": "❌",
    "DNC": "🚫"
  };
  
  return {
    blocks: [
      {
        type: "header",
        text: {
          type: "plain_text",
          text: `${emoji[notes.metadata.outcome]} ${notes.metadata.outcome.replace(/_/g, ' ')}`
        }
      },
      {
        type: "section",
        fields: [
          { type: "mrkdwn", text: `*Seller:*\n${notes.contactVerification.confirmedName}` },
          { type: "mrkdwn", text: `*Property:*\n${notes.property.acreage} acres, ${notes.property.county} County` },
          { type: "mrkdwn", text: `*Score:*\n${notes.scoring.qualificationScore}/100` },
          { type: "mrkdwn", text: `*Interest:*\n${notes.interest.finalInterestLevel}` }
        ]
      },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `*Summary:*\n${notes.agentNotes.callSummary.substring(0, 500)}...`
        }
      },
      {
        type: "actions",
        elements: [
          {
            type: "button",
            text: { type: "plain_text", text: "🎧 Listen to Recording" },
            url: notes.metadata.recordingUrl
          },
          {
            type: "button",
            text: { type: "plain_text", text: "📋 View Full Notes" },
            url: `${CRM_URL}/leads/${notes.metadata.leadId}`
          }
        ]
      }
    ]
  };
}
```

---

# NOTES QUALITY CHECKLIST

Before ending any call, ensure these are captured:

## Required for ALL Calls

- [ ] Contact verified (spoke with owner)
- [ ] Ownership confirmed
- [ ] Initial interest level captured
- [ ] Final interest level captured
- [ ] At least one interest progression entry
- [ ] Call outcome determined
- [ ] Call summary written
- [ ] Recording URL captured

## Required for INTERESTED Leads

- [ ] Motivation type identified
- [ ] Motivation details captured
- [ ] Emotional anchor captured (if revealed)
- [ ] Timeline/urgency captured
- [ ] Price expectation captured (if discussed)
- [ ] Decision maker authority confirmed
- [ ] Co-owner situation documented
- [ ] At least 3 qualifying questions answered
- [ ] Qualification score calculated

## Required for APPOINTMENTS

- [ ] Appointment date/time confirmed
- [ ] Appointment with (person) specified
- [ ] Contact method (email/SMS) captured
- [ ] Calendar invite sent confirmation
- [ ] Handoff notes generated

## Required for CONTRACTS

- [ ] All contract data fields populated
- [ ] Price verbally confirmed and logged
- [ ] Contract sent confirmation
- [ ] Walkthrough notes captured
- [ ] Signature received confirmation
- [ ] Co-owner signature status (if applicable)
- [ ] Follow-up schedule created
- [ ] Title company notified

## Required for OBJECTION HANDLING

- [ ] Each objection logged with timestamp
- [ ] Response to objection logged
- [ ] Outcome (overcome/unresolved) logged
- [ ] Total objection count updated

---

# IMPLEMENTATION NOTES

## Storage

Notes should be:
1. **Persisted in real-time** - Save after every state transition
2. **Stored in structured format** - JSON for easy querying
3. **Backed up with recording** - Notes reference recording timestamps
4. **Searchable** - Enable full-text search on quotes and summaries

## Privacy

- Seller PII should be handled according to privacy policy
- Notes may contain sensitive motivation (divorce, financial hardship)
- Access should be role-based
- Retention policy should match recording retention

## Analytics

Notes enable analysis of:
- Conversion by motivation type
- Objection success rates
- Pricing negotiation patterns
- Qualification score accuracy
- Agent performance metrics

---

*End of Note-Taking System Specification*
# LandVerse AI Agent - Voicemail & Double-Dial System
## Complete Specification for Unanswered Call Handling

---

# OVERVIEW

When calls go unanswered, the AI agent must:
1. **Double-Dial** - Immediately call back to increase answer rates
2. **Leave Strategic Voicemails** - If still no answer, leave compelling VM
3. **Track Attempts** - Document all attempts and outcomes
4. **Optimize Timing** - Learn best times to reach each lead

---

# 1. DOUBLE-DIAL SYSTEM

## Why Double-Dial?

Double-dialing (calling twice in quick succession) significantly increases contact rates because:
- First call may be dismissed as spam/unknown
- Second immediate call signals urgency/legitimacy
- Seller may have been unable to answer first call
- Pattern breaks through "ignore unknown callers" behavior

**Industry data shows double-dial can increase contact rates by 20-40%.**

## Double-Dial Configuration

```javascript
const DOUBLE_DIAL_CONFIG = {
  // Enable/disable double-dial
  enabled: true,
  
  // Time between first and second dial (seconds)
  delayBetweenDials: 5, // 5 seconds - just enough for them to see missed call
  
  // Maximum wait for answer on each dial (rings)
  ringsBeforeVoicemail: 4, // About 20-25 seconds
  
  // When to double-dial
  triggers: {
    noAnswer: true,          // No answer after X rings
    voicemailImmediate: true, // Goes straight to VM (possible spam block)
    busy: false,              // Line busy - don't double dial
    disconnected: false       // Number disconnected - don't double dial
  },
  
  // When NOT to double-dial
  exclusions: {
    afterHours: true,         // Don't double-dial outside calling hours
    recentContact: true,      // Already spoke with them recently
    recentAttempt: true,      // Already attempted today
    dncList: true,            // On do-not-call list
    maxAttemptsReached: true  // Hit max attempts for this lead
  },
  
  // Attempt limits
  limits: {
    maxDoubleDailsPerDay: 1,      // Only double-dial once per day per lead
    maxTotalAttemptsPerDay: 2,    // Max calls per lead per day
    maxTotalAttemptsPerWeek: 5,   // Max calls per lead per week
    maxTotalAttemptsEver: 8       // Max calls before marking dead
  }
};
```

## Double-Dial State Machine

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           DOUBLE-DIAL FLOW                                   │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌──────────────┐                                                           │
│  │  DIAL_FIRST  │                                                           │
│  │              │                                                           │
│  └──────┬───────┘                                                           │
│         │                                                                    │
│         ├────────────────────┬────────────────────┬──────────────────┐      │
│         ▼                    ▼                    ▼                  ▼      │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐   ┌────────────┐ │
│  │   ANSWERED   │    │  NO_ANSWER   │    │  VOICEMAIL   │   │   ERROR    │ │
│  │              │    │              │    │  IMMEDIATE   │   │            │ │
│  └──────┬───────┘    └──────┬───────┘    └──────┬───────┘   └─────┬──────┘ │
│         │                   │                   │                  │        │
│         ▼                   ▼                   ▼                  ▼        │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐   ┌────────────┐ │
│  │  PROCEED TO  │    │   WAIT 5s    │    │   WAIT 5s    │   │  LOG ERROR │ │
│  │  CALL FLOW   │    │              │    │              │   │  NO RETRY  │ │
│  └──────────────┘    └──────┬───────┘    └──────┬───────┘   └────────────┘ │
│                             │                   │                           │
│                             ▼                   ▼                           │
│                      ┌──────────────┐    ┌──────────────┐                   │
│                      │ DIAL_SECOND  │    │ DIAL_SECOND  │                   │
│                      │              │    │              │                   │
│                      └──────┬───────┘    └──────┬───────┘                   │
│                             │                   │                           │
│         ┌───────────────────┼───────────────────┼────────────────┐          │
│         ▼                   ▼                   ▼                ▼          │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐ ┌────────────┐   │
│  │   ANSWERED   │    │  NO_ANSWER   │    │  VOICEMAIL   │ │   BUSY     │   │
│  │              │    │              │    │              │ │            │   │
│  └──────┬───────┘    └──────┬───────┘    └──────┬───────┘ └─────┬──────┘   │
│         │                   │                   │               │           │
│         ▼                   ▼                   ▼               ▼           │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐ ┌────────────┐   │
│  │  PROCEED TO  │    │ LEAVE_VOICE  │    │ LEAVE_VOICE  │ │ SCHEDULE   │   │
│  │  CALL FLOW   │    │    MAIL      │    │    MAIL      │ │ RETRY      │   │
│  └──────────────┘    └──────────────┘    └──────────────┘ └────────────┘   │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Double-Dial Implementation

```javascript
async function executeCallWithDoubleDial(lead) {
  const attemptLog = {
    leadId: lead.id,
    startTime: new Date().toISOString(),
    attempts: []
  };
  
  // ═══════════════════════════════════════════════════════════════════
  // PRE-DIAL CHECKS
  // ═══════════════════════════════════════════════════════════════════
  
  // Check if we should even attempt this lead
  const preCheck = await preDialChecks(lead);
  if (!preCheck.proceed) {
    return {
      outcome: "SKIPPED",
      reason: preCheck.reason,
      nextAction: preCheck.nextAction
    };
  }
  
  // ═══════════════════════════════════════════════════════════════════
  // FIRST DIAL
  // ═══════════════════════════════════════════════════════════════════
  
  console.log(`[DIAL 1] Calling ${lead.phone}...`);
  
  const firstDial = await initiateCall({
    phone: lead.phone,
    leadId: lead.id,
    attemptNumber: 1,
    maxRings: DOUBLE_DIAL_CONFIG.ringsBeforeVoicemail
  });
  
  attemptLog.attempts.push({
    attemptNumber: 1,
    timestamp: new Date().toISOString(),
    outcome: firstDial.outcome,
    duration: firstDial.duration,
    disposition: firstDial.disposition
  });
  
  // ═══════════════════════════════════════════════════════════════════
  // FIRST DIAL OUTCOMES
  // ═══════════════════════════════════════════════════════════════════
  
  if (firstDial.outcome === "ANSWERED") {
    // Great! Proceed to call flow
    console.log(`[DIAL 1] ANSWERED - Proceeding to call flow`);
    return {
      outcome: "CONNECTED",
      attemptNumber: 1,
      callId: firstDial.callId,
      proceedToState: "RECORDING_DISCLOSURE"
    };
  }
  
  if (firstDial.outcome === "ERROR" || firstDial.outcome === "DISCONNECTED") {
    // Don't retry - phone number issue
    console.log(`[DIAL 1] ERROR/DISCONNECTED - Not retrying`);
    await updateLeadStatus(lead.id, "BAD_NUMBER", firstDial.disposition);
    return {
      outcome: firstDial.outcome,
      attemptNumber: 1,
      nextAction: "MARK_BAD_NUMBER"
    };
  }
  
  if (firstDial.outcome === "BUSY") {
    // Schedule retry later, don't double-dial
    console.log(`[DIAL 1] BUSY - Scheduling retry`);
    return {
      outcome: "BUSY",
      attemptNumber: 1,
      nextAction: "SCHEDULE_RETRY",
      retryIn: 30 * 60 // 30 minutes
    };
  }
  
  // ═══════════════════════════════════════════════════════════════════
  // NO ANSWER OR IMMEDIATE VOICEMAIL - PREPARE FOR SECOND DIAL
  // ═══════════════════════════════════════════════════════════════════
  
  if (firstDial.outcome === "NO_ANSWER" || firstDial.outcome === "VOICEMAIL_IMMEDIATE") {
    
    // Check if double-dial is appropriate
    if (!shouldDoubleDial(lead, attemptLog)) {
      console.log(`[DIAL 1] No answer - Double-dial not appropriate, leaving VM`);
      return await handleVoicemail(lead, attemptLog, 1);
    }
    
    console.log(`[DIAL 1] ${firstDial.outcome} - Waiting ${DOUBLE_DIAL_CONFIG.delayBetweenDials}s for second dial...`);
    
    // Wait before second dial
    await sleep(DOUBLE_DIAL_CONFIG.delayBetweenDials * 1000);
    
    // ═══════════════════════════════════════════════════════════════════
    // SECOND DIAL
    // ═══════════════════════════════════════════════════════════════════
    
    console.log(`[DIAL 2] Calling ${lead.phone}...`);
    
    const secondDial = await initiateCall({
      phone: lead.phone,
      leadId: lead.id,
      attemptNumber: 2,
      maxRings: DOUBLE_DIAL_CONFIG.ringsBeforeVoicemail,
      isDoubleDial: true
    });
    
    attemptLog.attempts.push({
      attemptNumber: 2,
      timestamp: new Date().toISOString(),
      outcome: secondDial.outcome,
      duration: secondDial.duration,
      disposition: secondDial.disposition,
      isDoubleDial: true
    });
    
    // ═══════════════════════════════════════════════════════════════════
    // SECOND DIAL OUTCOMES
    // ═══════════════════════════════════════════════════════════════════
    
    if (secondDial.outcome === "ANSWERED") {
      // Double-dial worked!
      console.log(`[DIAL 2] ANSWERED - Double-dial successful!`);
      return {
        outcome: "CONNECTED",
        attemptNumber: 2,
        callId: secondDial.callId,
        proceedToState: "RECORDING_DISCLOSURE",
        wasDoubleDial: true
      };
    }
    
    // Second dial also didn't connect - leave voicemail
    console.log(`[DIAL 2] ${secondDial.outcome} - Leaving voicemail`);
    return await handleVoicemail(lead, attemptLog, 2);
  }
  
  // Fallback
  return {
    outcome: "UNKNOWN",
    attemptNumber: 1,
    nextAction: "REVIEW"
  };
}

function shouldDoubleDial(lead, attemptLog) {
  // Check all exclusion conditions
  
  // Already double-dialed today?
  const todayAttempts = getAttemptsToday(lead.id);
  if (todayAttempts.filter(a => a.isDoubleDial).length >= DOUBLE_DIAL_CONFIG.limits.maxDoubleDailsPerDay) {
    return false;
  }
  
  // Max daily attempts reached?
  if (todayAttempts.length >= DOUBLE_DIAL_CONFIG.limits.maxTotalAttemptsPerDay) {
    return false;
  }
  
  // After hours?
  if (DOUBLE_DIAL_CONFIG.exclusions.afterHours && isAfterHours()) {
    return false;
  }
  
  // Recent contact?
  if (DOUBLE_DIAL_CONFIG.exclusions.recentContact && hadRecentContact(lead.id, 24)) {
    return false;
  }
  
  // On DNC?
  if (DOUBLE_DIAL_CONFIG.exclusions.dncList && isOnDNC(lead.phone)) {
    return false;
  }
  
  return true;
}
```

---

# 2. VOICEMAIL SYSTEM

## Voicemail Detection

The system must detect when a call goes to voicemail:

```javascript
const VOICEMAIL_DETECTION = {
  // AMD (Answering Machine Detection) via VAPI/Twilio
  useAMD: true,
  amdTimeout: 3000, // ms to wait for AMD result
  
  // Beep detection as backup
  beepDetection: {
    enabled: true,
    frequencyRange: [900, 1200], // Hz - typical VM beep range
    minDuration: 300, // ms
    maxDuration: 2000 // ms
  },
  
  // Phrase detection
  phraseDetection: {
    enabled: true,
    triggers: [
      "leave a message",
      "leave your message",
      "after the tone",
      "after the beep",
      "record your message",
      "please leave",
      "not available",
      "voicemail",
      "mailbox",
      "press pound",
      "press hash",
      "if you'd like to leave a callback number"
    ]
  },
  
  // Silence detection (personal VM often has silence before beep)
  silenceDetection: {
    enabled: true,
    silenceThreshold: 2000, // ms of silence
    afterGreeting: true // Only after initial greeting
  }
};

async function detectVoicemail(callSession) {
  return new Promise((resolve) => {
    let detected = false;
    let detectionMethod = null;
    
    // Method 1: AMD (fastest)
    callSession.on('amd_result', (result) => {
      if (result.type === 'machine' || result.type === 'fax') {
        detected = true;
        detectionMethod = 'AMD';
        resolve({ isVoicemail: true, method: 'AMD', confidence: result.confidence });
      }
    });
    
    // Method 2: Phrase detection
    callSession.on('transcript', (text) => {
      const lowerText = text.toLowerCase();
      for (const phrase of VOICEMAIL_DETECTION.phraseDetection.triggers) {
        if (lowerText.includes(phrase)) {
          detected = true;
          detectionMethod = 'PHRASE';
          resolve({ isVoicemail: true, method: 'PHRASE', trigger: phrase });
          return;
        }
      }
    });
    
    // Method 3: Beep detection
    callSession.on('tone_detected', (tone) => {
      if (tone.frequency >= VOICEMAIL_DETECTION.beepDetection.frequencyRange[0] &&
          tone.frequency <= VOICEMAIL_DETECTION.beepDetection.frequencyRange[1] &&
          tone.duration >= VOICEMAIL_DETECTION.beepDetection.minDuration) {
        detected = true;
        detectionMethod = 'BEEP';
        resolve({ isVoicemail: true, method: 'BEEP' });
      }
    });
    
    // Timeout - assume human if no VM detected
    setTimeout(() => {
      if (!detected) {
        resolve({ isVoicemail: false });
      }
    }, VOICEMAIL_DETECTION.amdTimeout);
  });
}
```

## Voicemail Scripts

### Script Selection Logic

```javascript
const VOICEMAIL_SCRIPT_SELECTION = {
  // Select script based on attempt number and lead data
  selectScript: (lead, attemptNumber, totalAttempts) => {
    // First attempt - standard intro
    if (attemptNumber === 1 || totalAttempts === 1) {
      if (lead.isOutOfState) return "FIRST_ATTEMPT_OUT_OF_STATE";
      if (lead.ownershipYears > 10) return "FIRST_ATTEMPT_LONG_OWNER";
      return "FIRST_ATTEMPT_STANDARD";
    }
    
    // Second attempt - add urgency
    if (attemptNumber === 2 || totalAttempts === 2) {
      return "SECOND_ATTEMPT";
    }
    
    // Third attempt - different angle
    if (attemptNumber === 3 || totalAttempts === 3) {
      return "THIRD_ATTEMPT_CURIOSITY";
    }
    
    // Fourth+ attempt - final attempt messaging
    if (totalAttempts >= 4) {
      return "FINAL_ATTEMPT";
    }
    
    return "FIRST_ATTEMPT_STANDARD";
  }
};
```

### Voicemail Scripts Library

```javascript
const VOICEMAIL_SCRIPTS = {
  
  // ═══════════════════════════════════════════════════════════════════
  // FIRST ATTEMPT SCRIPTS
  // ═══════════════════════════════════════════════════════════════════
  
  FIRST_ATTEMPT_STANDARD: {
    script: `Hi {lead.firstName}, this is {config.agentName} with {config.companyName}. 

I'm calling about your property in {lead.county} County. We're a local company that buys land for cash, and I wanted to see if you'd be interested in hearing what we could offer.

When you get a chance, give me a call back at {config.companyPhone}. 

Again, that's {config.agentName} with {config.companyName}, {config.companyPhoneFormatted}.

Hope to hear from you - have a great day!`,
    
    maxDuration: 35, // seconds
    tone: "friendly, professional",
    speakingPace: "moderate"
  },
  
  FIRST_ATTEMPT_OUT_OF_STATE: {
    script: `Hi {lead.firstName}, this is {config.agentName} with {config.companyName}. 

I noticed you own property here in {lead.county} County but you're out in {lead.mailingState}. We buy land for cash and I know managing property from a distance can be a hassle.

If you've ever thought about selling, I'd love to chat. Give me a call at {config.companyPhone}.

That's {config.agentName}, {config.companyPhoneFormatted}. Talk soon!`,
    
    maxDuration: 30,
    tone: "understanding, helpful"
  },
  
  FIRST_ATTEMPT_LONG_OWNER: {
    script: `Hi {lead.firstName}, {config.agentName} here with {config.companyName}. 

I see you've owned your {lead.acreage} acres in {lead.county} for quite a while now. With how much the area has changed, I wanted to reach out and see if you'd be curious what your property might be worth to a cash buyer today.

No pressure at all - just give me a call if you're interested. {config.companyPhone}.

That's {config.companyPhoneFormatted}. Have a great one!`,
    
    maxDuration: 32,
    tone: "respectful, curious"
  },
  
  FIRST_ATTEMPT_NEIGHBOR: {
    script: `Hi {lead.firstName}, this is {config.agentName} with {config.companyName}. 

We just bought a property near yours on {lead.roadName} and we're looking for more land in that exact area. 

If you've ever considered selling your {lead.acreage} acres, I'd love to talk. Call me at {config.companyPhone}.

Again, {config.agentName}, {config.companyPhoneFormatted}. Thanks!`,
    
    maxDuration: 28,
    tone: "friendly, specific"
  },
  
  // ═══════════════════════════════════════════════════════════════════
  // SECOND ATTEMPT SCRIPTS
  // ═══════════════════════════════════════════════════════════════════
  
  SECOND_ATTEMPT: {
    script: `Hi {lead.firstName}, {config.agentName} again with {config.companyName}. 

I called a couple days ago about your property in {lead.county}. I know you're probably busy, but I wanted to try you one more time.

We're actively buying land in your area right now and I'd hate for you to miss out if this is something you'd consider.

Give me a quick call when you get a chance - {config.companyPhone}. 

Thanks {lead.firstName}!`,
    
    maxDuration: 30,
    tone: "persistent but respectful",
    addUrgency: true
  },
  
  SECOND_ATTEMPT_CALLBACK: {
    // If they called back but we missed them
    script: `Hi {lead.firstName}, this is {config.agentName} returning your call about your property in {lead.county}. 

Sorry I missed you! I'd love to connect and discuss what we could offer.

Please try me again at {config.companyPhone} or let me know a good time to reach you.

Talk soon!`,
    
    maxDuration: 22,
    tone: "apologetic, eager"
  },
  
  // ═══════════════════════════════════════════════════════════════════
  // THIRD ATTEMPT SCRIPTS
  // ═══════════════════════════════════════════════════════════════════
  
  THIRD_ATTEMPT_CURIOSITY: {
    script: `Hi {lead.firstName}, {config.agentName} with {config.companyName} one more time.

I've tried to reach you a couple times about your {lead.acreage} acres in {lead.county}. I'm not trying to be a pest - I just know we'd pay a fair price and wanted to make sure you at least knew about the opportunity.

If you're not interested, no worries at all. But if you're even a little curious, give me a ring at {config.companyPhone}.

Take care!`,
    
    maxDuration: 33,
    tone: "humble, genuine"
  },
  
  THIRD_ATTEMPT_VALUE: {
    script: `Hey {lead.firstName}, {config.agentName} here.

Quick message about your land in {lead.county} - we're seeing properties in your area going for some interesting prices lately and I thought you might want to know what yours could be worth.

No strings attached - just call me at {config.companyPhone} if you want a quick estimate.

That's {config.companyPhoneFormatted}. Bye for now!`,
    
    maxDuration: 28,
    tone: "informative, no pressure"
  },
  
  // ═══════════════════════════════════════════════════════════════════
  // FINAL ATTEMPT SCRIPTS
  // ═══════════════════════════════════════════════════════════════════
  
  FINAL_ATTEMPT: {
    script: `Hi {lead.firstName}, {config.agentName} with {config.companyName}.

This will be my last call about your property in {lead.county}. I don't want to keep bothering you.

If you ever change your mind or just want to know what we'd pay, our number is {config.companyPhone}. We'll be here.

All the best to you!`,
    
    maxDuration: 25,
    tone: "respectful, final"
  },
  
  FINAL_ATTEMPT_SOFT: {
    script: `Hey {lead.firstName}, it's {config.agentName}. 

I've left you a few messages about your land. I'm going to stop calling, but I wanted you to have our number one more time in case you ever want to chat - {config.companyPhone}.

No pressure, no rush. We're here if you need us. Take care!`,
    
    maxDuration: 22,
    tone: "warm, closing"
  },
  
  // ═══════════════════════════════════════════════════════════════════
  // SPECIAL SITUATION SCRIPTS
  // ═══════════════════════════════════════════════════════════════════
  
  POST_APPOINTMENT_NOSHOW: {
    script: `Hi {lead.firstName}, this is {config.agentName} with {config.companyName}. 

I had you down for a call at {appointment.time} about your property. I hope everything's okay!

No worries if something came up - just give me a call back at {config.companyPhone} and we can reschedule.

Talk to you soon!`,
    
    maxDuration: 25,
    tone: "understanding, concerned"
  },
  
  POST_CONTRACT_FOLLOWUP: {
    script: `Hi {lead.firstName}, {config.agentName} here from {config.companyName}.

I wanted to check in on the contract I sent over for your property. Just want to make sure you received it and see if you have any questions.

Give me a call when you can - {config.companyPhone}.

Thanks!`,
    
    maxDuration: 22,
    tone: "helpful, follow-up"
  },
  
  CALLBACK_REQUESTED: {
    script: `Hi {lead.firstName}, this is {config.agentName} with {config.companyName} returning your call.

I'm sorry I missed you! I'm very interested in discussing your property in {lead.county}.

Please call me back at {config.companyPhone} or let me know a good time to try you again.

Looking forward to connecting!`,
    
    maxDuration: 23,
    tone: "eager, responsive"
  }
};
```

### Voicemail Delivery

```javascript
async function leaveVoicemail(lead, scriptId, context) {
  const script = VOICEMAIL_SCRIPTS[scriptId];
  
  // Interpolate variables
  const interpolatedScript = interpolateScript(script.script, {
    lead,
    config: CONFIG,
    appointment: context.appointment,
    ...context
  });
  
  // ═══════════════════════════════════════════════════════════════════
  // WAIT FOR BEEP
  // ═══════════════════════════════════════════════════════════════════
  
  console.log(`[VM] Waiting for beep...`);
  
  const beepDetected = await waitForBeep({
    maxWait: 10000, // 10 seconds max
    silenceThreshold: 500 // 500ms of silence after greeting
  });
  
  if (!beepDetected) {
    console.log(`[VM] No beep detected - attempting to leave message anyway`);
  }
  
  // Brief pause after beep (natural behavior)
  await sleep(300);
  
  // ═══════════════════════════════════════════════════════════════════
  // DELIVER VOICEMAIL
  // ═══════════════════════════════════════════════════════════════════
  
  console.log(`[VM] Leaving voicemail: ${scriptId}`);
  
  const vmResult = await speak(interpolatedScript, {
    pace: script.speakingPace || "moderate",
    tone: script.tone,
    maxDuration: script.maxDuration,
    
    // Voicemail-specific settings
    pauseAfterGreeting: 500, // Brief pause at start
    pauseBeforeCallback: 300, // Pause before phone number
    repeatPhoneNumber: true, // Say phone number twice
    phoneNumberPace: "slow" // Speak phone number slowly
  });
  
  // ═══════════════════════════════════════════════════════════════════
  // END VOICEMAIL
  // ═══════════════════════════════════════════════════════════════════
  
  // Brief pause at end
  await sleep(500);
  
  // Hang up
  await endCall();
  
  // ═══════════════════════════════════════════════════════════════════
  // LOG VOICEMAIL
  // ═══════════════════════════════════════════════════════════════════
  
  const vmLog = {
    leadId: lead.id,
    timestamp: new Date().toISOString(),
    scriptId: scriptId,
    scriptContent: interpolatedScript,
    duration: vmResult.duration,
    attemptNumber: context.attemptNumber,
    totalAttempts: context.totalAttempts,
    outcome: "VOICEMAIL_LEFT"
  };
  
  await logVoicemail(vmLog);
  
  // Update lead status
  await updateLeadStatus(lead.id, "VOICEMAIL_LEFT", {
    lastVoicemailAt: new Date().toISOString(),
    voicemailCount: (lead.voicemailCount || 0) + 1,
    nextAttemptDate: calculateNextAttempt(lead, context)
  });
  
  return vmLog;
}

async function waitForBeep(options) {
  return new Promise((resolve) => {
    let beepDetected = false;
    
    const timeout = setTimeout(() => {
      resolve(false);
    }, options.maxWait);
    
    // Listen for beep tone
    callSession.on('tone_detected', (tone) => {
      if (isBeepTone(tone)) {
        beepDetected = true;
        clearTimeout(timeout);
        resolve(true);
      }
    });
    
    // Also listen for silence after greeting (some VMs don't beep)
    callSession.on('silence', (duration) => {
      if (duration >= options.silenceThreshold && !beepDetected) {
        clearTimeout(timeout);
        resolve(true);
      }
    });
  });
}
```

---

# 3. ATTEMPT TRACKING & SCHEDULING

## Attempt Log Structure

```javascript
const AttemptLog = {
  leadId: "uuid",
  
  // Summary
  totalAttempts: 5,
  totalConnections: 1,
  totalVoicemails: 3,
  totalNoAnswer: 1,
  
  // Detailed attempts
  attempts: [
    {
      attemptNumber: 1,
      timestamp: "2024-01-15T10:30:00Z",
      type: "OUTBOUND",
      dialMethod: "SINGLE", // or "DOUBLE"
      
      dial1: {
        outcome: "NO_ANSWER",
        rings: 4,
        duration: 22
      },
      dial2: {
        outcome: "VOICEMAIL",
        duration: 35,
        voicemailScript: "FIRST_ATTEMPT_STANDARD",
        voicemailLeft: true
      },
      
      finalOutcome: "VOICEMAIL_LEFT",
      notes: "Left standard first attempt VM"
    },
    {
      attemptNumber: 2,
      timestamp: "2024-01-17T14:15:00Z",
      type: "OUTBOUND",
      dialMethod: "DOUBLE",
      
      dial1: {
        outcome: "NO_ANSWER",
        rings: 4,
        duration: 24
      },
      dial2: {
        outcome: "ANSWERED",
        duration: 847,
        connectedToFlow: true
      },
      
      finalOutcome: "CONNECTED",
      callOutcome: "APPOINTMENT_SET",
      notes: "Connected on second dial, set appointment"
    }
  ],
  
  // Scheduling
  nextAttempt: {
    scheduledFor: "2024-01-19T11:00:00Z",
    reason: "Follow up after appointment",
    priority: "HIGH"
  },
  
  // Best time analysis
  bestTimeToReach: {
    dayOfWeek: "Wednesday",
    timeRange: "2:00 PM - 4:00 PM",
    timezone: "America/Chicago",
    confidence: "MEDIUM",
    basedOn: "Connected on attempt 2 at 2:15 PM Wednesday"
  }
};
```

## Next Attempt Scheduling Logic

```javascript
function calculateNextAttempt(lead, context) {
  const now = new Date();
  const totalAttempts = context.totalAttempts || 1;
  const lastOutcome = context.outcome;
  
  // ═══════════════════════════════════════════════════════════════════
  // ATTEMPT LIMITS CHECK
  // ═══════════════════════════════════════════════════════════════════
  
  if (totalAttempts >= DOUBLE_DIAL_CONFIG.limits.maxTotalAttemptsEver) {
    return {
      scheduleAttempt: false,
      reason: "MAX_ATTEMPTS_REACHED",
      markAs: "EXHAUSTED"
    };
  }
  
  // ═══════════════════════════════════════════════════════════════════
  // SCHEDULING RULES
  // ═══════════════════════════════════════════════════════════════════
  
  const scheduleRules = {
    // After voicemail - wait 2 days
    "VOICEMAIL_LEFT": {
      minWait: 48 * 60 * 60 * 1000, // 48 hours
      maxWait: 72 * 60 * 60 * 1000, // 72 hours
      priority: "NORMAL"
    },
    
    // After no answer (no VM left) - try same day later
    "NO_ANSWER_NO_VM": {
      minWait: 2 * 60 * 60 * 1000, // 2 hours
      maxWait: 4 * 60 * 60 * 1000, // 4 hours
      priority: "HIGH",
      sameDay: true
    },
    
    // After busy signal - try in 30 min
    "BUSY": {
      minWait: 30 * 60 * 1000, // 30 minutes
      maxWait: 60 * 60 * 1000, // 1 hour
      priority: "HIGH"
    },
    
    // After callback request - honor their requested time
    "CALLBACK_REQUESTED": {
      useRequestedTime: true,
      priority: "HIGHEST"
    }
  };
  
  const rule = scheduleRules[lastOutcome] || scheduleRules["VOICEMAIL_LEFT"];
  
  // ═══════════════════════════════════════════════════════════════════
  // CALCULATE NEXT TIME
  // ═══════════════════════════════════════════════════════════════════
  
  let nextAttemptTime;
  
  if (rule.useRequestedTime && context.requestedCallbackTime) {
    nextAttemptTime = new Date(context.requestedCallbackTime);
  } else {
    // Random time within the wait window
    const waitMs = rule.minWait + Math.random() * (rule.maxWait - rule.minWait);
    nextAttemptTime = new Date(now.getTime() + waitMs);
  }
  
  // ═══════════════════════════════════════════════════════════════════
  // ADJUST FOR CALLING HOURS
  // ═══════════════════════════════════════════════════════════════════
  
  nextAttemptTime = adjustForCallingHours(nextAttemptTime, lead.timezone);
  
  // ═══════════════════════════════════════════════════════════════════
  // ADJUST FOR BEST TIME TO REACH (if known)
  // ═══════════════════════════════════════════════════════════════════
  
  if (lead.bestTimeToReach) {
    nextAttemptTime = adjustForBestTime(nextAttemptTime, lead.bestTimeToReach);
  }
  
  // ═══════════════════════════════════════════════════════════════════
  // VARY ATTEMPT TIMES
  // ═══════════════════════════════════════════════════════════════════
  
  // Don't always call at the same time - vary by 1-2 hours
  const variance = (Math.random() - 0.5) * 2 * 60 * 60 * 1000; // +/- 1 hour
  nextAttemptTime = new Date(nextAttemptTime.getTime() + variance);
  
  return {
    scheduleAttempt: true,
    scheduledFor: nextAttemptTime.toISOString(),
    priority: rule.priority,
    attemptNumber: totalAttempts + 1,
    reason: `Follow-up after ${lastOutcome}`
  };
}

function adjustForCallingHours(time, timezone) {
  const CALLING_HOURS = {
    start: 9, // 9 AM
    end: 20,  // 8 PM
    days: [1, 2, 3, 4, 5, 6] // Mon-Sat (0 = Sunday)
  };
  
  // Convert to lead's timezone
  const localTime = convertToTimezone(time, timezone);
  const hour = localTime.getHours();
  const day = localTime.getDay();
  
  // If outside calling hours, move to next valid time
  if (hour < CALLING_HOURS.start) {
    localTime.setHours(CALLING_HOURS.start, 0, 0, 0);
  } else if (hour >= CALLING_HOURS.end) {
    // Move to next day
    localTime.setDate(localTime.getDate() + 1);
    localTime.setHours(CALLING_HOURS.start, 0, 0, 0);
  }
  
  // If Sunday, move to Monday
  if (!CALLING_HOURS.days.includes(localTime.getDay())) {
    while (!CALLING_HOURS.days.includes(localTime.getDay())) {
      localTime.setDate(localTime.getDate() + 1);
    }
    localTime.setHours(CALLING_HOURS.start, 0, 0, 0);
  }
  
  return convertFromTimezone(localTime, timezone);
}
```

---

# 4. INTELLIGENT CALLING OPTIMIZATION

## Best Time to Reach Analysis

```javascript
async function analyzeBestTimeToReach(leadId) {
  // Get all attempts for this lead
  const attempts = await getAttemptHistory(leadId);
  
  // Find successful connections
  const connections = attempts.filter(a => a.finalOutcome === "CONNECTED");
  
  if (connections.length === 0) {
    // No connections yet - use general patterns
    return analyzeGeneralPatterns(leadId);
  }
  
  // Analyze connection patterns
  const analysis = {
    connections: connections.map(c => ({
      dayOfWeek: getDayOfWeek(c.timestamp),
      hour: getHour(c.timestamp),
      dialNumber: c.dial2?.outcome === "ANSWERED" ? 2 : 1
    })),
    
    // Most common connection day
    bestDay: findMostCommonDay(connections),
    
    // Most common connection hour range
    bestTimeRange: findBestTimeRange(connections),
    
    // Did double-dial work?
    doubleDialedWorked: connections.some(c => c.dial2?.outcome === "ANSWERED")
  };
  
  return {
    dayOfWeek: analysis.bestDay,
    timeRange: analysis.bestTimeRange,
    confidence: connections.length >= 2 ? "HIGH" : "MEDIUM",
    basedOn: `${connections.length} successful connection(s)`,
    recommendDoubleDial: analysis.doubleDialedWorked
  };
}

function analyzeGeneralPatterns(leadId) {
  // Use general best practices when we have no connection data
  
  // Industry data suggests these are good times:
  // - Tuesday-Thursday
  // - 10-11 AM and 4-6 PM local time
  
  return {
    dayOfWeek: ["Tuesday", "Wednesday", "Thursday"],
    timeRange: "10:00 AM - 11:00 AM, 4:00 PM - 6:00 PM",
    confidence: "LOW",
    basedOn: "Industry best practices",
    recommendDoubleDial: true
  };
}
```

## Call Queue Prioritization

```javascript
function prioritizeCallQueue(leads) {
  return leads.map(lead => {
    let score = 0;
    
    // ═══════════════════════════════════════════════════════════════════
    // PRIORITY FACTORS
    // ═══════════════════════════════════════════════════════════════════
    
    // Hot leads (requested callback)
    if (lead.callbackRequested) score += 100;
    
    // High qualification score
    score += (lead.qualificationScore || 0) * 0.5;
    
    // Fewer attempts = higher priority (new leads)
    score += Math.max(0, 50 - (lead.totalAttempts || 0) * 10);
    
    // Best time match
    if (isWithinBestTime(lead)) score += 30;
    
    // Recent inbound activity (called us back but missed)
    if (lead.recentInbound && lead.recentInboundHours < 24) score += 50;
    
    // Time since last attempt (don't call too frequently)
    const hoursSinceLastAttempt = getHoursSinceLastAttempt(lead);
    if (hoursSinceLastAttempt < 24) score -= 30;
    if (hoursSinceLastAttempt < 48) score -= 15;
    
    // High-value property
    if (lead.estimatedValue > 100000) score += 20;
    
    // ═══════════════════════════════════════════════════════════════════
    // PENALTY FACTORS
    // ═══════════════════════════════════════════════════════════════════
    
    // Many failed attempts
    if (lead.totalAttempts >= 5) score -= 50;
    
    // Previous voicemails not returned
    if (lead.voicemailCount >= 2 && !lead.hasReturnedCall) score -= 30;
    
    // Previously expressed low interest
    if (lead.lastInterestLevel === "COLD") score -= 40;
    
    return {
      lead,
      priorityScore: score
    };
  })
  .sort((a, b) => b.priorityScore - a.priorityScore)
  .map(item => item.lead);
}
```

---

# 5. FULL INTEGRATION WITH CALL FLOW

## Updated INIT State

```javascript
// STATE: INIT (Updated with double-dial)
async function handleInit(lead) {
  // Existing initialization...
  
  // Execute call with double-dial system
  const callResult = await executeCallWithDoubleDial(lead);
  
  switch (callResult.outcome) {
    case "CONNECTED":
      // Proceed to call flow
      callContext.wasDoubleDial = callResult.wasDoubleDial;
      callContext.attemptNumber = callResult.attemptNumber;
      return { nextState: "RECORDING_DISCLOSURE", callId: callResult.callId };
    
    case "VOICEMAIL_LEFT":
      // Log and end
      return { nextState: "END_VOICEMAIL", vmLog: callResult.vmLog };
    
    case "BUSY":
      // Schedule retry
      await scheduleRetry(lead, callResult.retryIn);
      return { nextState: "END_BUSY" };
    
    case "ERROR":
    case "DISCONNECTED":
      // Mark as bad number
      return { nextState: "END_BAD_NUMBER" };
    
    case "SKIPPED":
      // Lead not callable right now
      return { nextState: "END_SKIPPED", reason: callResult.reason };
    
    default:
      return { nextState: "END_UNKNOWN" };
  }
}
```

## New Terminal States

```javascript
// END_VOICEMAIL
const END_VOICEMAIL = {
  actions: async (context) => {
    await triggerWebhook("call_ended", {
      leadId: context.lead.id,
      outcome: "VOICEMAIL_LEFT",
      voicemailScript: context.vmLog.scriptId,
      attemptNumber: context.vmLog.attemptNumber,
      totalAttempts: context.vmLog.totalAttempts,
      nextAttemptScheduled: context.nextAttempt?.scheduledFor
    });
    
    // Update notes
    context.notes.metadata.outcome = "VOICEMAIL_LEFT";
    context.notes.agentNotes.callSummary = `Left voicemail #${context.vmLog.voicemailCount} using ${context.vmLog.scriptId} script. Next attempt scheduled for ${formatDate(context.nextAttempt?.scheduledFor)}.`;
  }
};

// END_BUSY
const END_BUSY = {
  actions: async (context) => {
    await triggerWebhook("call_ended", {
      leadId: context.lead.id,
      outcome: "BUSY",
      retryScheduled: context.nextAttempt?.scheduledFor
    });
  }
};

// END_BAD_NUMBER
const END_BAD_NUMBER = {
  actions: async (context) => {
    await triggerWebhook("lead_status_changed", {
      leadId: context.lead.id,
      oldStatus: "ACTIVE",
      newStatus: "BAD_NUMBER",
      reason: context.disposition
    });
  }
};
```

## Notes Integration

```javascript
// Add to CallNotes structure
const CallNotes = {
  // ... existing fields ...
  
  // ═══════════════════════════════════════════════════════════════════
  // DIAL ATTEMPT TRACKING
  // ═══════════════════════════════════════════════════════════════════
  dialAttempts: {
    attemptNumber: 2,
    totalAttempts: 3,
    
    dial1: {
      timestamp: "2024-01-15T14:30:00Z",
      outcome: "NO_ANSWER",
      rings: 4,
      duration: 22
    },
    
    dial2: {
      timestamp: "2024-01-15T14:30:27Z",
      outcome: "ANSWERED",
      duration: 847,
      isDoubleDial: true
    },
    
    connected: true,
    connectedOnDial: 2,
    
    notes: "Connected on second dial - double-dial worked"
  },
  
  // ═══════════════════════════════════════════════════════════════════
  // VOICEMAIL TRACKING
  // ═══════════════════════════════════════════════════════════════════
  voicemail: {
    left: false, // or true if VM was left
    scriptUsed: null, // e.g., "FIRST_ATTEMPT_STANDARD"
    duration: null,
    timestamp: null,
    
    // History of all VMs left
    voicemailHistory: [
      {
        timestamp: "2024-01-13T10:15:00Z",
        scriptId: "FIRST_ATTEMPT_STANDARD",
        duration: 32
      }
    ],
    
    totalVoicemailsLeft: 1
  },
  
  // ═══════════════════════════════════════════════════════════════════
  // ATTEMPT HISTORY (for this lead)
  // ═══════════════════════════════════════════════════════════════════
  attemptHistory: {
    totalAttempts: 3,
    totalConnections: 1,
    totalVoicemails: 1,
    totalNoAnswer: 1,
    
    connectionRate: 0.33, // 1/3
    
    history: [
      {
        date: "2024-01-13",
        attempts: 1,
        outcome: "VOICEMAIL_LEFT"
      },
      {
        date: "2024-01-15",
        attempts: 2, // double-dial counts as 1 attempt
        outcome: "CONNECTED",
        callOutcome: "APPOINTMENT_SET"
      }
    ],
    
    bestTimeToReach: {
      dayOfWeek: "Wednesday",
      timeRange: "2:00 PM - 4:00 PM",
      timezone: "America/Chicago"
    }
  },
  
  // ═══════════════════════════════════════════════════════════════════
  // NEXT ATTEMPT SCHEDULING
  // ═══════════════════════════════════════════════════════════════════
  nextAttempt: {
    scheduled: true,
    scheduledFor: "2024-01-17T10:00:00Z",
    reason: "Follow-up after voicemail",
    priority: "NORMAL",
    scriptToUse: "SECOND_ATTEMPT"
  }
};
```

---

# 6. VOICEMAIL RESPONSE HANDLING

## When Seller Calls Back

```javascript
// Handle inbound calls from leads who received voicemail
async function handleInboundCall(inboundNumber) {
  // Look up lead by phone number
  const lead = await findLeadByPhone(inboundNumber);
  
  if (!lead) {
    // Unknown number - general handling
    return handleUnknownInbound(inboundNumber);
  }
  
  // Check if they have recent voicemail
  const recentVM = getRecentVoicemail(lead.id, 72); // Within 72 hours
  
  // Update lead record
  await updateLead(lead.id, {
    hasReturnedCall: true,
    returnedCallAt: new Date().toISOString(),
    inboundFromVoicemail: !!recentVM
  });
  
  // Log this as significant
  await logEvent({
    type: "INBOUND_CALL",
    leadId: lead.id,
    fromVoicemail: !!recentVM,
    voicemailAge: recentVM ? hoursSince(recentVM.timestamp) : null
  });
  
  // Answer with appropriate greeting
  if (recentVM) {
    // They're returning our call
    return {
      greeting: `Hi! Thanks for calling back. This is {config.agentName} with {config.companyName}. Is this {lead.firstName}?`,
      context: {
        isCallback: true,
        voicemailScript: recentVM.scriptId,
        lead: lead
      },
      nextState: "CALLBACK_OPENING"
    };
  } else {
    // General inbound
    return {
      greeting: `Thanks for calling {config.companyName}! This is {config.agentName}. How can I help you?`,
      context: {
        isCallback: false,
        lead: lead
      },
      nextState: "INBOUND_OPENING"
    };
  }
}
```

## Callback-Specific Opening

```javascript
// STATE: CALLBACK_OPENING
const CALLBACK_OPENING = {
  entry: async (context) => {
    // Confirm identity
    speak(`Hi! Thanks for calling back. This is ${CONFIG.agentName} with ${CONFIG.companyName}. Is this ${context.lead.firstName}?`);
  },
  
  responses: {
    CONFIRMED: {
      patterns: ["yes", "this is", "speaking", "that's me"],
      script: `Great! I'm so glad you called back. I was reaching out about your property in ${context.lead.county} County. Is now a good time to chat?`,
      nextState: "CALLBACK_INTEREST_CHECK"
    },
    
    NOT_THEM: {
      patterns: ["no", "wrong person", "not me"],
      script: `Oh, I apologize! I was trying to reach ${context.lead.firstName} about a property in ${context.lead.county}. Is there a better number to reach them?`,
      nextState: "FIND_CORRECT_CONTACT"
    }
  }
};

// STATE: CALLBACK_INTEREST_CHECK
const CALLBACK_INTEREST_CHECK = {
  responses: {
    GOOD_TIME: {
      patterns: ["yes", "sure", "I have a minute", "go ahead"],
      script: `Perfect! So I was calling because we buy land in ${context.lead.county} and I wanted to see if selling your ${context.lead.acreage} acres is something you'd ever consider?`,
      nextState: "P1_INTEREST_PROBE"
    },
    
    BAD_TIME: {
      patterns: ["not really", "busy", "bad time"],
      script: `No problem! When would be a good time for me to call you back? I'd love to have a quick conversation about your property.`,
      nextState: "SCHEDULE_CALLBACK"
    },
    
    WANTS_INFO: {
      patterns: ["what's this about", "why calling", "what do you want"],
      script: `Of course! We're a land investment company that buys property for cash. I noticed you own ${context.lead.acreage} acres in ${context.lead.county} and wanted to reach out to see if you'd be interested in hearing an offer. Is that something you'd consider?`,
      nextState: "P1_INTEREST_PROBE"
    }
  }
};
```

---

# 7. METRICS & ANALYTICS

## Double-Dial Performance Tracking

```javascript
const DOUBLE_DIAL_METRICS = {
  // Overall performance
  summary: {
    totalCalls: 1000,
    totalConnections: 250,
    connectionRate: 0.25,
    
    // By dial number
    connectedOnDial1: 180,
    connectedOnDial2: 70,
    
    // Double-dial lift
    connectionRateWithoutDoubleDial: 0.18, // 180/1000
    connectionRateWithDoubleDial: 0.25,    // 250/1000
    doubleDiaLift: 0.39                     // 39% improvement
  },
  
  // By time of day
  byTimeOfDay: {
    "9-10AM": { dial1Rate: 0.15, dial2Rate: 0.08, totalRate: 0.23 },
    "10-11AM": { dial1Rate: 0.20, dial2Rate: 0.10, totalRate: 0.30 },
    "11AM-12PM": { dial1Rate: 0.18, dial2Rate: 0.09, totalRate: 0.27 },
    // ... etc
  },
  
  // By day of week
  byDayOfWeek: {
    "Monday": { dial1Rate: 0.16, dial2Rate: 0.07, totalRate: 0.23 },
    "Tuesday": { dial1Rate: 0.22, dial2Rate: 0.11, totalRate: 0.33 },
    "Wednesday": { dial1Rate: 0.24, dial2Rate: 0.12, totalRate: 0.36 },
    // ... etc
  }
};
```

## Voicemail Performance Tracking

```javascript
const VOICEMAIL_METRICS = {
  // Overall
  totalVoicemailsLeft: 500,
  callbacksReceived: 75,
  callbackRate: 0.15, // 15%
  
  // By script
  byScript: {
    "FIRST_ATTEMPT_STANDARD": {
      sent: 200,
      callbacks: 25,
      callbackRate: 0.125
    },
    "FIRST_ATTEMPT_OUT_OF_STATE": {
      sent: 50,
      callbacks: 10,
      callbackRate: 0.20
    },
    "SECOND_ATTEMPT": {
      sent: 150,
      callbacks: 25,
      callbackRate: 0.167
    },
    // ... etc
  },
  
  // Time to callback
  avgTimeToCallback: 18.5, // hours
  medianTimeToCallback: 12, // hours
  
  // Callback conversion
  callbacksToAppointments: 45,
  callbackConversionRate: 0.60 // 60% of callbacks become appointments
};
```

---

# 8. CONFIGURATION SUMMARY

## Complete Double-Dial + Voicemail Config

```javascript
const CALLING_CONFIG = {
  // ═══════════════════════════════════════════════════════════════════
  // DOUBLE-DIAL SETTINGS
  // ═══════════════════════════════════════════════════════════════════
  doubleDial: {
    enabled: true,
    delayBetweenDials: 5, // seconds
    ringsBeforeVoicemail: 4,
    maxDoubleDailsPerDay: 1,
    maxTotalAttemptsPerDay: 2,
    maxTotalAttemptsPerWeek: 5,
    maxTotalAttemptsEver: 8
  },
  
  // ═══════════════════════════════════════════════════════════════════
  // VOICEMAIL SETTINGS
  // ═══════════════════════════════════════════════════════════════════
  voicemail: {
    leaveVoicemail: true,
    maxVoicemailsPerLead: 4,
    minDaysBetweenVoicemails: 2,
    useAMD: true,
    amdTimeout: 3000,
    beepDetection: true,
    waitForBeepTimeout: 10000,
    maxVoicemailDuration: 40 // seconds
  },
  
  // ═══════════════════════════════════════════════════════════════════
  // CALLING HOURS
  // ═══════════════════════════════════════════════════════════════════
  callingHours: {
    timezone: "lead_local", // Use lead's timezone
    weekday: { start: 9, end: 20 }, // 9 AM - 8 PM
    saturday: { start: 10, end: 18 }, // 10 AM - 6 PM
    sunday: null // No calls
  },
  
  // ═══════════════════════════════════════════════════════════════════
  // RETRY SCHEDULING
  // ═══════════════════════════════════════════════════════════════════
  retryScheduling: {
    afterVoicemail: { minHours: 48, maxHours: 72 },
    afterNoAnswer: { minHours: 2, maxHours: 4 },
    afterBusy: { minMinutes: 30, maxMinutes: 60 },
    afterConnect: { minHours: 24, maxHours: 48 }, // For follow-up
    varyAttemptTimes: true,
    varianceHours: 2
  },
  
  // ═══════════════════════════════════════════════════════════════════
  // INBOUND HANDLING
  // ═══════════════════════════════════════════════════════════════════
  inbound: {
    recognizeCallbacks: true,
    callbackWindow: 72, // hours
    prioritizeCallbacks: true,
    callbackGreeting: "callback_specific"
  }
};
```

---

*End of Voicemail & Double-Dial System Specification*
# LandVerse AI Agent - State-of-the-Art Triple-Dial System
## Maximum Contact Rate Technology

---

# OVERVIEW

The Triple-Dial System is an advanced calling methodology that maximizes contact rates through:

1. **Intelligent Triple-Dialing** - Three strategically-timed call attempts per session
2. **Adaptive Delay Timing** - Variable pauses based on dial outcomes
3. **Progressive Caller ID** - Rotate numbers to avoid spam flagging
4. **Predictive Analytics** - ML-driven best time optimization
5. **Real-Time Spam Monitoring** - Detect and adapt to carrier blocking
6. **A/B Testing Framework** - Continuous optimization
7. **Advanced Voicemail Strategy** - Multi-variant scripts with performance tracking

**Expected Results:**
- Double-dial: +25-40% contact rate lift
- Triple-dial: +45-65% contact rate lift
- Combined with optimization: +70-100% contact rate lift

---

# 1. TRIPLE-DIAL ARCHITECTURE

## Why Triple-Dial?

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    CONTACT RATE BY DIAL NUMBER                               │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  DIAL 1: ████████████████████░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░  18% connect    │
│                                                                              │
│  DIAL 2: ████████░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░  +8% connect    │
│          (26% cumulative)                                                    │
│                                                                              │
│  DIAL 3: █████░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░  +6% connect    │
│          (32% cumulative)                                                    │
│                                                                              │
│  ═══════════════════════════════════════════════════════════════════════    │
│  TOTAL LIFT: 78% improvement over single-dial                                │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

**Psychology Behind Triple-Dial:**
- **Dial 1:** Often dismissed as spam/unknown
- **Dial 2:** "That number again... maybe important"
- **Dial 3:** "Okay, someone really needs to reach me"

## Master Configuration

```javascript
const TRIPLE_DIAL_CONFIG = {
  // ═══════════════════════════════════════════════════════════════════════════
  // CORE SETTINGS
  // ═══════════════════════════════════════════════════════════════════════════
  enabled: true,
  maxDials: 3,
  
  // ═══════════════════════════════════════════════════════════════════════════
  // TIMING STRATEGY (Adaptive)
  // ═══════════════════════════════════════════════════════════════════════════
  timing: {
    // Delay between Dial 1 → Dial 2
    dial1ToDial2: {
      baseDelay: 5,        // seconds
      minDelay: 3,         // minimum
      maxDelay: 10,        // maximum
      adaptive: true,      // Adjust based on outcome
      
      // Adaptive rules
      adaptiveRules: {
        // If Dial 1 rang fully (4+ rings) - they might be reaching for phone
        "RANG_FULL": { delay: 3, reason: "Quick redial while they're reaching" },
        
        // If Dial 1 went straight to VM - possible spam block
        "IMMEDIATE_VM": { delay: 8, reason: "Wait longer, may be blocked" },
        
        // If Dial 1 was declined/rejected
        "DECLINED": { delay: 10, reason: "They saw it, give breathing room" },
        
        // Default
        "DEFAULT": { delay: 5, reason: "Standard interval" }
      }
    },
    
    // Delay between Dial 2 → Dial 3
    dial2ToDial3: {
      baseDelay: 8,
      minDelay: 5,
      maxDelay: 15,
      adaptive: true,
      
      adaptiveRules: {
        "RANG_FULL": { delay: 5, reason: "They're seeing the pattern" },
        "IMMEDIATE_VM": { delay: 12, reason: "Likely blocked, longer wait" },
        "DECLINED": { delay: 15, reason: "Active rejection, final attempt" },
        "PARTIAL_RING": { delay: 6, reason: "May have been busy" },
        "DEFAULT": { delay: 8, reason: "Standard interval" }
      }
    }
  },
  
  // ═══════════════════════════════════════════════════════════════════════════
  // RING SETTINGS
  // ═══════════════════════════════════════════════════════════════════════════
  rings: {
    dial1: {
      maxRings: 4,           // ~20-25 seconds
      minRingsBeforeVM: 2    // At least 2 rings before considering VM
    },
    dial2: {
      maxRings: 5,           // Slightly longer on dial 2
      minRingsBeforeVM: 2
    },
    dial3: {
      maxRings: 6,           // Longest wait on final dial
      minRingsBeforeVM: 3    // More patience on last attempt
    }
  },
  
  // ═══════════════════════════════════════════════════════════════════════════
  // ABORT CONDITIONS (Stop dialing early)
  // ═══════════════════════════════════════════════════════════════════════════
  abortConditions: {
    // Stop immediately
    immediate: [
      "NUMBER_DISCONNECTED",
      "INVALID_NUMBER", 
      "CARRIER_ERROR",
      "BLOCKED_BY_USER"      // "Your call cannot be completed"
    ],
    
    // Stop after Dial 2 (don't do Dial 3)
    afterDial2: [
      "DECLINED_TWICE",      // Actively rejected both times
      "SPAM_DETECTION",      // Carrier flagged as spam
      "VM_FULL"              // Voicemail box is full
    ],
    
    // Continue but flag for review
    flagForReview: [
      "INTERNATIONAL_ROUTE", // Call routing internationally
      "UNUSUAL_RING_PATTERN",// Non-standard ring cadence
      "LONG_CONNECT_TIME"    // >5 seconds to connect
    ]
  },
  
  // ═══════════════════════════════════════════════════════════════════════════
  // CALLER ID STRATEGY
  // ═══════════════════════════════════════════════════════════════════════════
  callerId: {
    rotation: {
      enabled: true,
      strategy: "PROGRESSIVE", // PROGRESSIVE, RANDOM, AREA_CODE_MATCH
      
      // Progressive: Use different number for each dial
      progressive: {
        dial1: "PRIMARY",      // Main company number
        dial2: "SECONDARY",    // Alternate number
        dial3: "LOCAL"         // Local area code number
      }
    },
    
    // Pool of numbers to use
    numberPool: [
      { id: "PRIMARY", number: "+15125551234", label: "Main", priority: 1 },
      { id: "SECONDARY", number: "+15125555678", label: "Alt", priority: 2 },
      { id: "LOCAL_512", number: "+15125559999", label: "Austin Local", areaCode: "512" },
      { id: "LOCAL_214", number: "+12145551234", label: "Dallas Local", areaCode: "214" },
      { id: "LOCAL_713", number: "+17135551234", label: "Houston Local", areaCode: "713" }
    ],
    
    // Match caller ID to lead's area code when possible
    areaCodeMatching: {
      enabled: true,
      fallbackToClosest: true  // Use geographically close area code if no match
    }
  },
  
  // ═══════════════════════════════════════════════════════════════════════════
  // SPAM MITIGATION
  // ═══════════════════════════════════════════════════════════════════════════
  spamMitigation: {
    // Monitor for spam indicators
    monitoring: {
      enabled: true,
      trackImmediateVM: true,       // Track straight-to-VM rate
      trackDeclineRate: true,       // Track active decline rate
      trackAnswerRate: true         // Track answer rate by number
    },
    
    // Thresholds for number health
    healthThresholds: {
      immediateVMRate: 0.40,        // >40% straight to VM = likely flagged
      declineRate: 0.30,            // >30% declines = likely flagged
      answerRate: 0.10              // <10% answer rate = investigate
    },
    
    // Actions when number appears flagged
    flaggedActions: {
      rotateOut: true,              // Stop using flagged number
      cooldownPeriod: 72,           // Hours before trying again
      alertTeam: true,              // Send Slack alert
      requestSTIRSHAKEN: true       // Request carrier attestation
    },
    
    // Call pacing to avoid triggering spam filters
    pacing: {
      maxCallsPerHour: 30,          // Per number
      maxCallsPerDay: 200,          // Per number
      minSecondsBetweenCalls: 10,   // Don't rapid-fire
      burstProtection: true         // Prevent calling 10 numbers in 1 minute
    }
  },
  
  // ═══════════════════════════════════════════════════════════════════════════
  // ATTEMPT LIMITS
  // ═══════════════════════════════════════════════════════════════════════════
  limits: {
    maxTripleDialSessionsPerDay: 1,    // Only triple-dial once per day
    maxTotalAttemptsPerDay: 2,         // Max dial sessions per day
    maxTotalAttemptsPerWeek: 5,        // Max dial sessions per week
    maxTotalAttemptsEver: 10,          // Max before marking exhausted
    maxVoicemailsEver: 4,              // Max VMs before stopping
    
    // Cool-down periods
    cooldowns: {
      afterVoicemail: 48,              // Hours before next attempt
      afterNoAnswer: 4,                // Hours before next attempt
      afterDecline: 72,                // Hours after active decline
      afterConnect: 24                 // Hours after successful connect
    }
  },
  
  // ═══════════════════════════════════════════════════════════════════════════
  // VOICEMAIL STRATEGY
  // ═══════════════════════════════════════════════════════════════════════════
  voicemail: {
    leaveAfter: "DIAL_3",              // Only leave VM after all 3 dials
    skipIfLeftRecently: true,
    recentVMWindow: 48,                // Hours
    maxVMDuration: 35,                 // Seconds
    
    // When to leave VM vs. hang up
    vmDecision: {
      firstAttemptEver: "LEAVE_VM",
      secondAttemptEver: "LEAVE_VM",
      thirdAttemptEver: "LEAVE_VM_SHORT",
      fourthPlusAttempt: "HANG_UP"     // Stop leaving VMs
    }
  }
};
```

---

# 2. TRIPLE-DIAL STATE MACHINE

## Visual Flow

```
┌─────────────────────────────────────────────────────────────────────────────────────┐
│                            TRIPLE-DIAL STATE MACHINE                                 │
├─────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                      │
│  ┌───────────────┐                                                                  │
│  │  PRE_FLIGHT   │  Check limits, select caller IDs, verify number                  │
│  │    CHECKS     │                                                                  │
│  └───────┬───────┘                                                                  │
│          │                                                                          │
│          ▼                                                                          │
│  ┌───────────────┐         ┌─────────────────────────────────────────────────────┐ │
│  │               │         │                     ANSWERED                         │ │
│  │   DIAL_ONE    │────────►│  → Record dial1_success                             │ │
│  │               │         │  → Proceed to CALL_FLOW                             │ │
│  └───────┬───────┘         └─────────────────────────────────────────────────────┘ │
│          │                                                                          │
│          │ NO_ANSWER / VM_IMMEDIATE / DECLINED                                      │
│          │                                                                          │
│          ▼                                                                          │
│  ┌───────────────┐                                                                  │
│  │  DIAL_ONE     │  Analyze outcome, calculate optimal delay                        │
│  │   ANALYSIS    │  Select caller ID for dial 2                                     │
│  └───────┬───────┘                                                                  │
│          │                                                                          │
│          │ ABORT_CONDITIONS_MET? ──────► END (Bad number, blocked, etc.)           │
│          │                                                                          │
│          ▼                                                                          │
│  ┌───────────────┐                                                                  │
│  │    WAIT       │  Adaptive delay (3-10 seconds)                                   │
│  │  (DIAL 1→2)   │  During wait: analyze audio patterns                            │
│  └───────┬───────┘                                                                  │
│          │                                                                          │
│          ▼                                                                          │
│  ┌───────────────┐         ┌─────────────────────────────────────────────────────┐ │
│  │               │         │                     ANSWERED                         │ │
│  │   DIAL_TWO    │────────►│  → Record dial2_success (double-dial win!)          │ │
│  │               │         │  → Proceed to CALL_FLOW                             │ │
│  └───────┬───────┘         └─────────────────────────────────────────────────────┘ │
│          │                                                                          │
│          │ NO_ANSWER / VM_IMMEDIATE / DECLINED                                      │
│          │                                                                          │
│          ▼                                                                          │
│  ┌───────────────┐                                                                  │
│  │  DIAL_TWO     │  Analyze outcome, calculate optimal delay                        │
│  │   ANALYSIS    │  Determine if dial 3 should proceed                             │
│  └───────┬───────┘                                                                  │
│          │                                                                          │
│          │ ABORT_AFTER_DIAL2? ──────► VOICEMAIL_DECISION                           │
│          │                                                                          │
│          ▼                                                                          │
│  ┌───────────────┐                                                                  │
│  │    WAIT       │  Adaptive delay (5-15 seconds)                                   │
│  │  (DIAL 2→3)   │  Longer wait for final attempt                                  │
│  └───────┬───────┘                                                                  │
│          │                                                                          │
│          ▼                                                                          │
│  ┌───────────────┐         ┌─────────────────────────────────────────────────────┐ │
│  │               │         │                     ANSWERED                         │ │
│  │  DIAL_THREE   │────────►│  → Record dial3_success (triple-dial win!)          │ │
│  │               │         │  → Proceed to CALL_FLOW                             │ │
│  └───────┬───────┘         └─────────────────────────────────────────────────────┘ │
│          │                                                                          │
│          │ NO_ANSWER / VM_IMMEDIATE / DECLINED                                      │
│          │                                                                          │
│          ▼                                                                          │
│  ┌───────────────┐                                                                  │
│  │  DIAL_THREE   │  Final analysis                                                 │
│  │   ANALYSIS    │  Log all dial patterns for ML                                   │
│  └───────┬───────┘                                                                  │
│          │                                                                          │
│          ▼                                                                          │
│  ┌───────────────┐                                                                  │
│  │   VOICEMAIL   │  Leave VM? Which script? Or hang up?                            │
│  │   DECISION    │                                                                  │
│  └───────┬───────┘                                                                  │
│          │                                                                          │
│          ├──────────────────┬──────────────────┐                                    │
│          ▼                  ▼                  ▼                                    │
│  ┌───────────────┐  ┌───────────────┐  ┌───────────────┐                           │
│  │  LEAVE_VM     │  │  LEAVE_VM     │  │   HANG_UP     │                           │
│  │   (FULL)      │  │   (SHORT)     │  │   (NO VM)     │                           │
│  └───────┬───────┘  └───────┬───────┘  └───────┬───────┘                           │
│          │                  │                  │                                    │
│          └──────────────────┴──────────────────┘                                    │
│                             │                                                       │
│                             ▼                                                       │
│                     ┌───────────────┐                                               │
│                     │  POST_CALL    │  Log everything, schedule next attempt        │
│                     │   PROCESS     │  Update ML models, sync CRM                   │
│                     └───────────────┘                                               │
│                                                                                      │
└─────────────────────────────────────────────────────────────────────────────────────┘
```

---

# 3. IMPLEMENTATION

## Main Triple-Dial Executor

```javascript
async function executeTripleDial(lead) {
  const session = {
    sessionId: generateSessionId(),
    leadId: lead.id,
    startTime: Date.now(),
    dials: [],
    callerIdsUsed: [],
    outcome: null,
    analytics: {}
  };
  
  // ═══════════════════════════════════════════════════════════════════════════
  // PRE-FLIGHT CHECKS
  // ═══════════════════════════════════════════════════════════════════════════
  
  const preFlightResult = await preFlightChecks(lead, session);
  if (!preFlightResult.proceed) {
    return {
      outcome: "SKIPPED",
      reason: preFlightResult.reason,
      session
    };
  }
  
  // Get caller ID strategy for this session
  const callerIdStrategy = await selectCallerIdStrategy(lead);
  
  console.log(`[TRIPLE-DIAL] Starting session ${session.sessionId} for lead ${lead.id}`);
  console.log(`[TRIPLE-DIAL] Caller ID strategy: ${callerIdStrategy.strategy}`);
  
  // ═══════════════════════════════════════════════════════════════════════════
  // DIAL ONE
  // ═══════════════════════════════════════════════════════════════════════════
  
  const dial1CallerId = callerIdStrategy.getCallerId(1, lead);
  console.log(`[DIAL 1] Initiating with caller ID: ${dial1CallerId.number}`);
  
  const dial1 = await executeDial({
    dialNumber: 1,
    lead,
    callerId: dial1CallerId,
    maxRings: TRIPLE_DIAL_CONFIG.rings.dial1.maxRings,
    session
  });
  
  session.dials.push(dial1);
  session.callerIdsUsed.push(dial1CallerId.id);
  
  // ─────────────────────────────────────────────────────────────────────────
  // DIAL 1 OUTCOMES
  // ─────────────────────────────────────────────────────────────────────────
  
  if (dial1.outcome === "ANSWERED") {
    console.log(`[DIAL 1] ✓ ANSWERED on first dial!`);
    session.outcome = "CONNECTED_DIAL_1";
    session.connectedOnDial = 1;
    await logTripleDialSuccess(session, 1);
    
    return {
      outcome: "CONNECTED",
      dialNumber: 1,
      callId: dial1.callId,
      session,
      proceedToState: "RECORDING_DISCLOSURE"
    };
  }
  
  // Check abort conditions
  if (shouldAbortImmediately(dial1)) {
    console.log(`[DIAL 1] ✗ Abort condition met: ${dial1.disposition}`);
    session.outcome = "ABORTED";
    session.abortReason = dial1.disposition;
    
    return {
      outcome: dial1.disposition,
      dialNumber: 1,
      session,
      nextAction: getAbortAction(dial1.disposition)
    };
  }
  
  // Analyze dial 1 for optimal dial 2 timing
  const dial1Analysis = analyzeDial(dial1);
  const dial2Delay = calculateAdaptiveDelay(dial1Analysis, "dial1ToDial2");
  
  console.log(`[DIAL 1] ${dial1.outcome} after ${dial1.rings} rings`);
  console.log(`[DIAL 1] Analysis: ${dial1Analysis.pattern} → Waiting ${dial2Delay}s`);
  
  // ═══════════════════════════════════════════════════════════════════════════
  // WAIT BETWEEN DIAL 1 → DIAL 2
  // ═══════════════════════════════════════════════════════════════════════════
  
  await intelligentWait(dial2Delay, {
    reason: "dial1_to_dial2",
    dialAnalysis: dial1Analysis
  });
  
  // ═══════════════════════════════════════════════════════════════════════════
  // DIAL TWO
  // ═══════════════════════════════════════════════════════════════════════════
  
  const dial2CallerId = callerIdStrategy.getCallerId(2, lead);
  console.log(`[DIAL 2] Initiating with caller ID: ${dial2CallerId.number}`);
  
  const dial2 = await executeDial({
    dialNumber: 2,
    lead,
    callerId: dial2CallerId,
    maxRings: TRIPLE_DIAL_CONFIG.rings.dial2.maxRings,
    session,
    previousDial: dial1
  });
  
  session.dials.push(dial2);
  session.callerIdsUsed.push(dial2CallerId.id);
  
  // ─────────────────────────────────────────────────────────────────────────
  // DIAL 2 OUTCOMES
  // ─────────────────────────────────────────────────────────────────────────
  
  if (dial2.outcome === "ANSWERED") {
    console.log(`[DIAL 2] ✓ ANSWERED on second dial! (Double-dial success)`);
    session.outcome = "CONNECTED_DIAL_2";
    session.connectedOnDial = 2;
    await logTripleDialSuccess(session, 2);
    
    return {
      outcome: "CONNECTED",
      dialNumber: 2,
      callId: dial2.callId,
      session,
      proceedToState: "RECORDING_DISCLOSURE",
      wasDoubleDial: true
    };
  }
  
  // Check abort conditions for dial 2
  if (shouldAbortAfterDial2(dial1, dial2)) {
    console.log(`[DIAL 2] ✗ Abort after dial 2: ${getAbortReason(dial1, dial2)}`);
    session.outcome = "ABORTED_AFTER_DIAL_2";
    
    // Still might leave voicemail
    return await handleVoicemailDecision(lead, session, 2);
  }
  
  // Analyze dial 2 for optimal dial 3 timing
  const dial2Analysis = analyzeDial(dial2, dial1Analysis);
  const dial3Delay = calculateAdaptiveDelay(dial2Analysis, "dial2ToDial3");
  
  console.log(`[DIAL 2] ${dial2.outcome} after ${dial2.rings} rings`);
  console.log(`[DIAL 2] Analysis: ${dial2Analysis.pattern} → Waiting ${dial3Delay}s`);
  
  // ═══════════════════════════════════════════════════════════════════════════
  // WAIT BETWEEN DIAL 2 → DIAL 3
  // ═══════════════════════════════════════════════════════════════════════════
  
  await intelligentWait(dial3Delay, {
    reason: "dial2_to_dial3",
    dialAnalysis: dial2Analysis
  });
  
  // ═══════════════════════════════════════════════════════════════════════════
  // DIAL THREE (Final Attempt)
  // ═══════════════════════════════════════════════════════════════════════════
  
  const dial3CallerId = callerIdStrategy.getCallerId(3, lead);
  console.log(`[DIAL 3] Final attempt with caller ID: ${dial3CallerId.number}`);
  
  const dial3 = await executeDial({
    dialNumber: 3,
    lead,
    callerId: dial3CallerId,
    maxRings: TRIPLE_DIAL_CONFIG.rings.dial3.maxRings,
    session,
    previousDial: dial2,
    isFinalDial: true
  });
  
  session.dials.push(dial3);
  session.callerIdsUsed.push(dial3CallerId.id);
  
  // ─────────────────────────────────────────────────────────────────────────
  // DIAL 3 OUTCOMES
  // ─────────────────────────────────────────────────────────────────────────
  
  if (dial3.outcome === "ANSWERED") {
    console.log(`[DIAL 3] ✓ ANSWERED on third dial! (Triple-dial success!)`);
    session.outcome = "CONNECTED_DIAL_3";
    session.connectedOnDial = 3;
    await logTripleDialSuccess(session, 3);
    
    return {
      outcome: "CONNECTED",
      dialNumber: 3,
      callId: dial3.callId,
      session,
      proceedToState: "RECORDING_DISCLOSURE",
      wasTripleDial: true
    };
  }
  
  // All three dials failed to connect
  console.log(`[DIAL 3] ${dial3.outcome} - All dials exhausted`);
  session.outcome = "NO_CONNECT_AFTER_3_DIALS";
  
  // ═══════════════════════════════════════════════════════════════════════════
  // VOICEMAIL DECISION
  // ═══════════════════════════════════════════════════════════════════════════
  
  return await handleVoicemailDecision(lead, session, 3);
}
```

## Individual Dial Execution

```javascript
async function executeDial(params) {
  const { dialNumber, lead, callerId, maxRings, session, previousDial, isFinalDial } = params;
  
  const dialRecord = {
    dialNumber,
    callerId: callerId.id,
    callerIdNumber: callerId.number,
    startTime: Date.now(),
    outcome: null,
    rings: 0,
    duration: 0,
    disposition: null,
    rawEvents: [],
    analysis: {}
  };
  
  try {
    // ─────────────────────────────────────────────────────────────────────────
    // INITIATE CALL
    // ─────────────────────────────────────────────────────────────────────────
    
    const callSession = await initiateOutboundCall({
      to: lead.phone,
      from: callerId.number,
      callerId: callerId.number,
      timeout: maxRings * 6, // ~6 seconds per ring
      machineDetection: "DetectMessageEnd", // AMD enabled
      asyncAmd: true,
      statusCallback: generateStatusCallbackUrl(session.sessionId, dialNumber),
      statusCallbackEvent: ["initiated", "ringing", "answered", "completed"],
      record: true
    });
    
    dialRecord.callSid = callSession.callSid;
    
    // ─────────────────────────────────────────────────────────────────────────
    // MONITOR CALL PROGRESS
    // ─────────────────────────────────────────────────────────────────────────
    
    const callResult = await monitorCallProgress(callSession, {
      maxRings,
      dialNumber,
      onRing: (ringCount) => {
        dialRecord.rings = ringCount;
        dialRecord.rawEvents.push({ event: "ring", count: ringCount, time: Date.now() });
      },
      onStatusChange: (status) => {
        dialRecord.rawEvents.push({ event: "status", status, time: Date.now() });
      }
    });
    
    dialRecord.outcome = callResult.outcome;
    dialRecord.duration = Date.now() - dialRecord.startTime;
    dialRecord.disposition = callResult.disposition;
    dialRecord.answeredBy = callResult.answeredBy; // human, machine, unknown
    dialRecord.machineDetectionDuration = callResult.machineDetectionDuration;
    
    // ─────────────────────────────────────────────────────────────────────────
    // ANALYZE OUTCOME
    // ─────────────────────────────────────────────────────────────────────────
    
    dialRecord.analysis = {
      pattern: determineDialPattern(dialRecord),
      suspectedBlock: detectPossibleBlock(dialRecord, previousDial),
      ringBehavior: analyzeRingBehavior(dialRecord),
      qualityIndicators: extractQualityIndicators(dialRecord)
    };
    
    // ─────────────────────────────────────────────────────────────────────────
    // OUTCOME HANDLING
    // ─────────────────────────────────────────────────────────────────────────
    
    if (callResult.outcome === "ANSWERED") {
      if (callResult.answeredBy === "machine") {
        // Answered by voicemail
        dialRecord.outcome = "VOICEMAIL";
        dialRecord.vmDetectionMethod = callResult.machineDetectionMethod;
        
        if (isFinalDial) {
          // Store call session for VM delivery
          dialRecord.vmCallSession = callSession;
        } else {
          // Hang up - will retry
          await callSession.hangup();
        }
      } else {
        // Human answered!
        dialRecord.outcome = "ANSWERED";
        dialRecord.callId = callSession.callId;
        dialRecord.callSession = callSession;
      }
    }
    
    return dialRecord;
    
  } catch (error) {
    dialRecord.outcome = "ERROR";
    dialRecord.error = error.message;
    dialRecord.duration = Date.now() - dialRecord.startTime;
    return dialRecord;
  }
}
```

## Adaptive Delay Calculation

```javascript
function calculateAdaptiveDelay(dialAnalysis, transitionType) {
  const config = TRIPLE_DIAL_CONFIG.timing[transitionType];
  
  // Start with base delay
  let delay = config.baseDelay;
  
  // Apply adaptive rules based on dial outcome pattern
  const rule = config.adaptiveRules[dialAnalysis.pattern] || config.adaptiveRules["DEFAULT"];
  delay = rule.delay;
  
  // ─────────────────────────────────────────────────────────────────────────
  // ADDITIONAL ADJUSTMENTS
  // ─────────────────────────────────────────────────────────────────────────
  
  // If suspected spam block, wait longer
  if (dialAnalysis.suspectedBlock) {
    delay = Math.min(delay * 1.5, config.maxDelay);
  }
  
  // If rings were increasing (they're considering answering), dial faster
  if (dialAnalysis.ringBehavior === "INCREASING") {
    delay = Math.max(delay * 0.7, config.minDelay);
  }
  
  // Add small random variance (±1 second) to seem more human
  const variance = (Math.random() - 0.5) * 2;
  delay = Math.max(config.minDelay, Math.min(config.maxDelay, delay + variance));
  
  return Math.round(delay * 10) / 10; // Round to 1 decimal
}

function determineDialPattern(dialRecord) {
  const { outcome, rings, disposition, duration } = dialRecord;
  
  // Immediate voicemail (< 2 rings)
  if (outcome === "VOICEMAIL" && rings < 2) {
    return "IMMEDIATE_VM";
  }
  
  // Full ring cycle completed
  if (outcome === "NO_ANSWER" && rings >= 4) {
    return "RANG_FULL";
  }
  
  // Partial rings then stopped
  if (outcome === "NO_ANSWER" && rings > 0 && rings < 4) {
    return "PARTIAL_RING";
  }
  
  // Actively declined (rings then quick end)
  if (disposition === "busy" || 
      (outcome === "NO_ANSWER" && duration < 5000 && rings > 0)) {
    return "DECLINED";
  }
  
  // Carrier/network issues
  if (disposition === "failed" || disposition === "no-answer") {
    return "CARRIER_ISSUE";
  }
  
  return "DEFAULT";
}
```

## Caller ID Strategy

```javascript
class CallerIdStrategy {
  constructor(config) {
    this.config = config;
    this.numberPool = config.numberPool;
    this.strategy = config.rotation.strategy;
  }
  
  getCallerId(dialNumber, lead) {
    switch (this.strategy) {
      case "PROGRESSIVE":
        return this.getProgressiveCallerId(dialNumber, lead);
      case "AREA_CODE_MATCH":
        return this.getAreaCodeMatchCallerId(dialNumber, lead);
      case "RANDOM":
        return this.getRandomCallerId(dialNumber, lead);
      case "SMART":
        return this.getSmartCallerId(dialNumber, lead);
      default:
        return this.numberPool[0];
    }
  }
  
  // PROGRESSIVE: Different number for each dial
  getProgressiveCallerId(dialNumber, lead) {
    const mapping = this.config.rotation.progressive;
    
    switch (dialNumber) {
      case 1:
        return this.findNumber(mapping.dial1, lead);
      case 2:
        return this.findNumber(mapping.dial2, lead);
      case 3:
        return this.findNumber(mapping.dial3, lead);
    }
  }
  
  // AREA_CODE_MATCH: Match lead's area code when possible
  getAreaCodeMatchCallerId(dialNumber, lead) {
    const leadAreaCode = lead.phone.substring(2, 5); // Assuming +1XXXXXXXXXX
    
    // Try to find matching area code
    const matchingNumber = this.numberPool.find(n => n.areaCode === leadAreaCode);
    if (matchingNumber && this.isNumberHealthy(matchingNumber)) {
      return matchingNumber;
    }
    
    // Fall back to closest geographic area code
    const closestNumber = this.findClosestAreaCode(leadAreaCode);
    if (closestNumber && this.isNumberHealthy(closestNumber)) {
      return closestNumber;
    }
    
    // Fall back to primary
    return this.numberPool[0];
  }
  
  // SMART: ML-driven selection based on past performance
  getSmartCallerId(dialNumber, lead) {
    // Get performance data for each number with this lead's characteristics
    const numberScores = this.numberPool.map(num => ({
      number: num,
      score: this.calculateNumberScore(num, lead, dialNumber)
    }));
    
    // Sort by score and pick best healthy number
    numberScores.sort((a, b) => b.score - a.score);
    
    for (const { number } of numberScores) {
      if (this.isNumberHealthy(number)) {
        return number;
      }
    }
    
    return this.numberPool[0];
  }
  
  calculateNumberScore(number, lead, dialNumber) {
    let score = 100;
    
    // Historical answer rate with this number
    const answerRate = getNumberAnswerRate(number.id);
    score += answerRate * 50;
    
    // Area code match bonus
    const leadAreaCode = lead.phone.substring(2, 5);
    if (number.areaCode === leadAreaCode) {
      score += 20;
    }
    
    // Recent spam flags penalty
    const recentFlags = getRecentSpamFlags(number.id, 24);
    score -= recentFlags * 10;
    
    // Dial number preference (primary for dial 1, local for dial 3)
    if (dialNumber === 1 && number.id === "PRIMARY") score += 10;
    if (dialNumber === 3 && number.areaCode) score += 15;
    
    return score;
  }
  
  isNumberHealthy(number) {
    const health = getNumberHealth(number.id);
    
    if (health.immediateVMRate > TRIPLE_DIAL_CONFIG.spamMitigation.healthThresholds.immediateVMRate) {
      return false;
    }
    if (health.declineRate > TRIPLE_DIAL_CONFIG.spamMitigation.healthThresholds.declineRate) {
      return false;
    }
    if (health.inCooldown) {
      return false;
    }
    
    return true;
  }
}
```

---

# 4. ADVANCED VOICEMAIL SYSTEM

## Voicemail Decision Engine

```javascript
async function handleVoicemailDecision(lead, session, afterDialNumber) {
  const vmConfig = TRIPLE_DIAL_CONFIG.voicemail;
  const totalAttempts = await getTotalAttemptsCount(lead.id);
  const recentVM = await getRecentVoicemail(lead.id, vmConfig.recentVMWindow);
  
  // ─────────────────────────────────────────────────────────────────────────
  // DECISION MATRIX
  // ─────────────────────────────────────────────────────────────────────────
  
  const decision = {
    leaveVoicemail: false,
    vmType: null,
    scriptId: null,
    reason: null
  };
  
  // Already left VM recently?
  if (recentVM && vmConfig.skipIfLeftRecently) {
    decision.reason = "VM_LEFT_RECENTLY";
    return await finalizeNoVoicemail(lead, session, decision);
  }
  
  // Too many VMs already?
  const vmCount = await getVoicemailCount(lead.id);
  if (vmCount >= TRIPLE_DIAL_CONFIG.limits.maxVoicemailsEver) {
    decision.reason = "MAX_VMS_REACHED";
    return await finalizeNoVoicemail(lead, session, decision);
  }
  
  // Determine VM type based on attempt number
  const vmDecisionRule = vmConfig.vmDecision;
  let vmType;
  
  if (totalAttempts === 1) {
    vmType = vmDecisionRule.firstAttemptEver;
  } else if (totalAttempts === 2) {
    vmType = vmDecisionRule.secondAttemptEver;
  } else if (totalAttempts === 3) {
    vmType = vmDecisionRule.thirdAttemptEver;
  } else {
    vmType = vmDecisionRule.fourthPlusAttempt;
  }
  
  if (vmType === "HANG_UP") {
    decision.reason = "STRATEGY_NO_VM";
    return await finalizeNoVoicemail(lead, session, decision);
  }
  
  // We're leaving a voicemail!
  decision.leaveVoicemail = true;
  decision.vmType = vmType;
  decision.scriptId = selectVoicemailScript(lead, totalAttempts, vmType);
  
  return await executeVoicemailDelivery(lead, session, decision);
}
```

## Voicemail Script Selection (A/B Testing)

```javascript
function selectVoicemailScript(lead, attemptNumber, vmType) {
  // Get eligible scripts for this situation
  const eligibleScripts = getEligibleScripts(lead, attemptNumber, vmType);
  
  // ─────────────────────────────────────────────────────────────────────────
  // A/B TESTING SELECTION
  // ─────────────────────────────────────────────────────────────────────────
  
  const abTestConfig = getActiveABTest("voicemail_scripts");
  
  if (abTestConfig && abTestConfig.active) {
    // We're in an A/B test - use test distribution
    const variant = selectABTestVariant(abTestConfig, lead.id);
    
    logABTestAssignment({
      testId: abTestConfig.id,
      leadId: lead.id,
      variant: variant,
      scriptId: variant.scriptId
    });
    
    return variant.scriptId;
  }
  
  // ─────────────────────────────────────────────────────────────────────────
  // PERFORMANCE-BASED SELECTION
  // ─────────────────────────────────────────────────────────────────────────
  
  // Get performance data for each eligible script
  const scriptPerformance = eligibleScripts.map(scriptId => ({
    scriptId,
    ...getScriptPerformance(scriptId)
  }));
  
  // Use Thompson Sampling for exploration/exploitation balance
  const selected = thompsonSamplingSelect(scriptPerformance, {
    successMetric: "callbackRate",
    explorationFactor: 0.1
  });
  
  return selected.scriptId;
}

function getEligibleScripts(lead, attemptNumber, vmType) {
  const scripts = [];
  
  // First attempt scripts
  if (attemptNumber === 1) {
    scripts.push("FIRST_ATTEMPT_STANDARD");
    
    if (lead.isOutOfState) {
      scripts.push("FIRST_ATTEMPT_OUT_OF_STATE");
    }
    if (lead.ownershipYears > 10) {
      scripts.push("FIRST_ATTEMPT_LONG_OWNER");
    }
    if (lead.roadName) {
      scripts.push("FIRST_ATTEMPT_NEIGHBOR");
    }
  }
  
  // Second attempt scripts
  else if (attemptNumber === 2) {
    scripts.push("SECOND_ATTEMPT");
    scripts.push("SECOND_ATTEMPT_URGENCY");
  }
  
  // Third attempt scripts
  else if (attemptNumber === 3) {
    scripts.push("THIRD_ATTEMPT_CURIOSITY");
    scripts.push("THIRD_ATTEMPT_VALUE");
    
    if (vmType === "LEAVE_VM_SHORT") {
      scripts.push("THIRD_ATTEMPT_SHORT");
    }
  }
  
  // Fourth+ attempt scripts
  else {
    scripts.push("FINAL_ATTEMPT");
    scripts.push("FINAL_ATTEMPT_SOFT");
  }
  
  return scripts;
}
```

## Enhanced Voicemail Scripts

```javascript
const VOICEMAIL_SCRIPTS_V2 = {
  
  // ═══════════════════════════════════════════════════════════════════════════
  // FIRST ATTEMPT SCRIPTS
  // ═══════════════════════════════════════════════════════════════════════════
  
  FIRST_ATTEMPT_STANDARD: {
    variants: [
      {
        id: "A",
        script: `Hi {lead.firstName}, this is {config.agentName} with {config.companyName}. 

I'm calling about your property in {lead.county} County - we buy land for cash and I wanted to see if selling is something you'd ever consider.

Give me a call back at {config.companyPhoneFormatted}. 

Again, {config.agentName} at {config.companyPhoneFormatted}. 

Have a great day!`
      },
      {
        id: "B",
        script: `Hey {lead.firstName}, {config.agentName} here with {config.companyName}.

Real quick - I noticed you own some land in {lead.county} and I'm wondering if you'd be open to hearing a cash offer?

Call me back at {config.companyPhoneFormatted}.

That's {config.companyPhoneFormatted}. Thanks!`
      },
      {
        id: "C", 
        script: `Hi {lead.firstName}, this is {config.agentName}.

I'm reaching out because we're actively buying land in {lead.county} right now. If your {lead.acreage} acres might be for sale, I'd love to chat.

My number is {config.companyPhoneFormatted}.

Hope to hear from you!`
      }
    ],
    maxDuration: 30,
    tone: "friendly, professional"
  },
  
  FIRST_ATTEMPT_OUT_OF_STATE: {
    variants: [
      {
        id: "A",
        script: `Hi {lead.firstName}, {config.agentName} with {config.companyName}.

I noticed you own land here in {lead.county} but you're living out in {lead.mailingState}. We buy land for cash and I know managing property from afar can be a hassle.

If you've ever thought about selling, call me at {config.companyPhoneFormatted}.

Take care!`
      },
      {
        id: "B",
        script: `Hey {lead.firstName}, this is {config.agentName}.

You've got {lead.acreage} acres in {lead.county} but you're all the way in {lead.mailingState}. If that property's been on your mind, I'd love to make you a cash offer.

{config.companyPhoneFormatted}. Talk soon!`
      }
    ],
    maxDuration: 28,
    tone: "understanding"
  },
  
  FIRST_ATTEMPT_LONG_OWNER: {
    variants: [
      {
        id: "A",
        script: `Hi {lead.firstName}, {config.agentName} here with {config.companyName}.

I see you've owned your {lead.acreage} acres in {lead.county} for quite a while. With how much the area's changed, I wanted to see if you'd be curious what it's worth to a cash buyer today.

Call me at {config.companyPhoneFormatted}.

Have a good one!`
      }
    ],
    maxDuration: 26,
    tone: "respectful"
  },
  
  FIRST_ATTEMPT_NEIGHBOR: {
    variants: [
      {
        id: "A",
        script: `Hi {lead.firstName}, {config.agentName} with {config.companyName}.

We just bought a property near yours on {lead.roadName} and we're looking for more land in that area.

If you'd consider selling your {lead.acreage} acres, give me a call at {config.companyPhoneFormatted}.

Thanks!`
      }
    ],
    maxDuration: 22,
    tone: "specific, local"
  },
  
  // ═══════════════════════════════════════════════════════════════════════════
  // SECOND ATTEMPT SCRIPTS
  // ═══════════════════════════════════════════════════════════════════════════
  
  SECOND_ATTEMPT: {
    variants: [
      {
        id: "A",
        script: `Hi {lead.firstName}, {config.agentName} again with {config.companyName}.

I called a couple days ago about your property in {lead.county}. Just wanted to try one more time - we're actively buying in your area and I'd hate for you to miss out.

Call me at {config.companyPhoneFormatted}.

Thanks!`
      },
      {
        id: "B",
        script: `Hey {lead.firstName}, it's {config.agentName} again.

Still hoping to connect about your {lead.acreage} acres. No pressure - just call me if you're curious about what we'd pay.

{config.companyPhoneFormatted}. Take care!`
      }
    ],
    maxDuration: 25,
    tone: "persistent but respectful"
  },
  
  SECOND_ATTEMPT_URGENCY: {
    variants: [
      {
        id: "A",
        script: `Hi {lead.firstName}, {config.agentName} with {config.companyName}.

I tried reaching you earlier - wanted to let you know we're closing deals in {lead.county} this month and your property came up on our list.

If timing is ever going to be right, it might be now. Call me at {config.companyPhoneFormatted}.

Thanks!`
      }
    ],
    maxDuration: 24,
    tone: "urgent but not pushy"
  },
  
  // ═══════════════════════════════════════════════════════════════════════════
  // THIRD ATTEMPT SCRIPTS
  // ═══════════════════════════════════════════════════════════════════════════
  
  THIRD_ATTEMPT_CURIOSITY: {
    variants: [
      {
        id: "A",
        script: `Hi {lead.firstName}, {config.agentName} one more time.

I've tried to reach you a couple times about your land in {lead.county}. Not trying to be a pest - just wanted to make sure you knew about the opportunity.

Even if you're just curious what we'd pay, call me at {config.companyPhoneFormatted}.

Take care!`
      }
    ],
    maxDuration: 26,
    tone: "humble"
  },
  
  THIRD_ATTEMPT_VALUE: {
    variants: [
      {
        id: "A",
        script: `Hey {lead.firstName}, {config.agentName} here.

Quick message - we're seeing properties in {lead.county} go for some interesting prices lately. Thought you might want to know what your {lead.acreage} acres could be worth.

No strings attached - {config.companyPhoneFormatted}.

Bye for now!`
      }
    ],
    maxDuration: 22,
    tone: "informative"
  },
  
  THIRD_ATTEMPT_SHORT: {
    variants: [
      {
        id: "A",
        script: `{lead.firstName}, {config.agentName} again about your land. 

If you'd ever sell, call me - {config.companyPhoneFormatted}.

Thanks!`
      }
    ],
    maxDuration: 12,
    tone: "brief"
  },
  
  // ═══════════════════════════════════════════════════════════════════════════
  // FINAL ATTEMPT SCRIPTS
  // ═══════════════════════════════════════════════════════════════════════════
  
  FINAL_ATTEMPT: {
    variants: [
      {
        id: "A",
        script: `Hi {lead.firstName}, {config.agentName} with {config.companyName}.

This will be my last call about your property. I don't want to keep bothering you.

If you ever change your mind, our number is {config.companyPhoneFormatted}. We'll be here.

All the best!`
      }
    ],
    maxDuration: 20,
    tone: "respectful, final"
  },
  
  FINAL_ATTEMPT_SOFT: {
    variants: [
      {
        id: "A",
        script: `Hey {lead.firstName}, it's {config.agentName}.

I've left you a few messages about your land. I'm going to stop calling, but save this number - {config.companyPhoneFormatted} - in case you ever want to chat.

No pressure. Take care!`
      }
    ],
    maxDuration: 18,
    tone: "warm, closing"
  },
  
  // ═══════════════════════════════════════════════════════════════════════════
  // SPECIAL SITUATION SCRIPTS
  // ═══════════════════════════════════════════════════════════════════════════
  
  CALLBACK_RETURN: {
    variants: [
      {
        id: "A",
        script: `Hi {lead.firstName}, {config.agentName} returning your call!

Sorry I missed you - I'm really interested in discussing your property.

Try me again at {config.companyPhoneFormatted} or text me the best time to call.

Talk soon!`
      }
    ],
    maxDuration: 18,
    tone: "eager"
  },
  
  POST_APPOINTMENT_NOSHOW: {
    variants: [
      {
        id: "A",
        script: `Hi {lead.firstName}, {config.agentName} here.

I had you down for a call at {appointment.time} - hope everything's okay!

No worries if something came up. Call me back at {config.companyPhoneFormatted} and we can reschedule.

Talk soon!`
      }
    ],
    maxDuration: 20,
    tone: "understanding"
  }
};
```

## Voicemail Delivery with Quality Control

```javascript
async function executeVoicemailDelivery(lead, session, decision) {
  const scriptConfig = VOICEMAIL_SCRIPTS_V2[decision.scriptId];
  
  // Select variant (for A/B testing)
  const variant = selectScriptVariant(scriptConfig, lead.id);
  
  // Interpolate variables
  const finalScript = interpolateScript(variant.script, {
    lead,
    config: CONFIG,
    appointment: session.context?.appointment
  });
  
  console.log(`[VM] Delivering ${decision.scriptId} variant ${variant.id}`);
  
  // ─────────────────────────────────────────────────────────────────────────
  // WAIT FOR BEEP
  // ─────────────────────────────────────────────────────────────────────────
  
  const lastDial = session.dials[session.dials.length - 1];
  
  if (lastDial.vmCallSession) {
    // We're already connected to VM from dial 3
    await waitForVoicemailBeep(lastDial.vmCallSession, {
      maxWait: 8000,
      onGreetingEnd: () => console.log("[VM] Greeting ended")
    });
  } else {
    // Need to dial into VM
    const vmConnection = await connectToVoicemail(lead.phone, session);
    await waitForVoicemailBeep(vmConnection, { maxWait: 10000 });
  }
  
  // Brief natural pause after beep
  await sleep(400);
  
  // ─────────────────────────────────────────────────────────────────────────
  // DELIVER MESSAGE
  // ─────────────────────────────────────────────────────────────────────────
  
  const deliveryResult = await deliverVoicemailMessage(finalScript, {
    maxDuration: scriptConfig.maxDuration,
    tone: scriptConfig.tone,
    
    // Speaking parameters
    speakingRate: 1.0,       // Normal pace
    pitch: 1.0,              // Normal pitch
    
    // Phone number handling
    phoneNumberPace: 0.85,   // Slower for phone number
    repeatPhoneNumber: true, // Say it twice
    pauseBeforePhone: 500,   // Pause before number
    pauseBetweenRepeats: 800 // Pause between repeats
  });
  
  // ─────────────────────────────────────────────────────────────────────────
  // END VOICEMAIL
  // ─────────────────────────────────────────────────────────────────────────
  
  await sleep(300);
  await endCall();
  
  // ─────────────────────────────────────────────────────────────────────────
  // LOG VOICEMAIL
  // ─────────────────────────────────────────────────────────────────────────
  
  const vmLog = {
    sessionId: session.sessionId,
    leadId: lead.id,
    scriptId: decision.scriptId,
    variantId: variant.id,
    scriptContent: finalScript,
    duration: deliveryResult.duration,
    deliveryQuality: deliveryResult.quality,
    timestamp: new Date().toISOString()
  };
  
  await logVoicemail(vmLog);
  
  // Update A/B test tracking
  await trackABTestDelivery({
    testId: getActiveABTest("voicemail_scripts")?.id,
    scriptId: decision.scriptId,
    variantId: variant.id,
    leadId: lead.id
  });
  
  // Update session
  session.outcome = "VOICEMAIL_LEFT";
  session.voicemail = vmLog;
  
  // Schedule next attempt
  const nextAttempt = await scheduleNextAttempt(lead, session, "VOICEMAIL_LEFT");
  session.nextAttempt = nextAttempt;
  
  return {
    outcome: "VOICEMAIL_LEFT",
    session,
    vmLog,
    nextAttempt
  };
}
```

---

# 5. INTELLIGENT SCHEDULING

## Predictive Best Time Engine

```javascript
class PredictiveBestTimeEngine {
  constructor() {
    this.model = null;
    this.featureExtractor = new FeatureExtractor();
  }
  
  async predictBestTime(lead) {
    // ─────────────────────────────────────────────────────────────────────────
    // COLLECT FEATURES
    // ─────────────────────────────────────────────────────────────────────────
    
    const features = {
      // Lead characteristics
      timezone: lead.timezone,
      areaCode: lead.phone.substring(2, 5),
      state: lead.state,
      isRural: lead.isRural,
      ownershipYears: lead.ownershipYears,
      isOutOfState: lead.isOutOfState,
      
      // Historical data for this lead
      previousAttempts: await getAttemptHistory(lead.id),
      previousConnections: await getConnectionHistory(lead.id),
      
      // Aggregate data for similar leads
      similarLeadPatterns: await getSimilarLeadPatterns(lead)
    };
    
    // ─────────────────────────────────────────────────────────────────────────
    // LEVEL 1: LEAD-SPECIFIC HISTORY
    // ─────────────────────────────────────────────────────────────────────────
    
    if (features.previousConnections.length > 0) {
      // We've connected with this lead before - use that data
      const connectionTimes = features.previousConnections.map(c => ({
        dayOfWeek: getDayOfWeek(c.timestamp),
        hour: getHour(c.timestamp, lead.timezone),
        connected: true
      }));
      
      const bestDay = mode(connectionTimes.map(c => c.dayOfWeek));
      const bestHour = mode(connectionTimes.map(c => c.hour));
      
      return {
        confidence: "HIGH",
        source: "LEAD_HISTORY",
        recommendations: [{
          dayOfWeek: bestDay,
          hourRange: [bestHour - 1, bestHour + 1],
          score: 0.9
        }]
      };
    }
    
    // ─────────────────────────────────────────────────────────────────────────
    // LEVEL 2: SIMILAR LEAD PATTERNS
    // ─────────────────────────────────────────────────────────────────────────
    
    if (features.similarLeadPatterns.length >= 10) {
      // We have enough data from similar leads
      const patternAnalysis = this.analyzeSimilarPatterns(features.similarLeadPatterns);
      
      return {
        confidence: "MEDIUM",
        source: "SIMILAR_LEADS",
        recommendations: patternAnalysis.topTimes.slice(0, 3)
      };
    }
    
    // ─────────────────────────────────────────────────────────────────────────
    // LEVEL 3: GENERAL BEST PRACTICES
    // ─────────────────────────────────────────────────────────────────────────
    
    return {
      confidence: "LOW",
      source: "BEST_PRACTICES",
      recommendations: [
        { dayOfWeek: "Wednesday", hourRange: [10, 11], score: 0.7 },
        { dayOfWeek: "Tuesday", hourRange: [14, 16], score: 0.65 },
        { dayOfWeek: "Thursday", hourRange: [10, 11], score: 0.65 },
        { dayOfWeek: "Wednesday", hourRange: [14, 16], score: 0.6 }
      ]
    };
  }
  
  analyzeSimilarPatterns(patterns) {
    // Group by day + hour
    const timeSlots = {};
    
    for (const pattern of patterns) {
      const key = `${pattern.dayOfWeek}-${pattern.hour}`;
      if (!timeSlots[key]) {
        timeSlots[key] = { attempts: 0, connections: 0 };
      }
      timeSlots[key].attempts++;
      if (pattern.connected) {
        timeSlots[key].connections++;
      }
    }
    
    // Calculate connection rate for each slot
    const slotScores = Object.entries(timeSlots).map(([key, data]) => ({
      key,
      dayOfWeek: key.split("-")[0],
      hour: parseInt(key.split("-")[1]),
      connectionRate: data.connections / data.attempts,
      sampleSize: data.attempts
    }));
    
    // Sort by connection rate (with sample size weighting)
    slotScores.sort((a, b) => {
      const aScore = a.connectionRate * Math.min(1, a.sampleSize / 20);
      const bScore = b.connectionRate * Math.min(1, b.sampleSize / 20);
      return bScore - aScore;
    });
    
    return {
      topTimes: slotScores.slice(0, 5).map(s => ({
        dayOfWeek: s.dayOfWeek,
        hourRange: [s.hour, s.hour + 1],
        score: s.connectionRate
      }))
    };
  }
}

async function scheduleNextAttempt(lead, session, outcome) {
  const bestTimeEngine = new PredictiveBestTimeEngine();
  const prediction = await bestTimeEngine.predictBestTime(lead);
  
  const totalAttempts = await getTotalAttemptsCount(lead.id);
  
  // ─────────────────────────────────────────────────────────────────────────
  // DETERMINE BASE WAIT TIME
  // ─────────────────────────────────────────────────────────────────────────
  
  const waitRules = {
    "VOICEMAIL_LEFT": { minHours: 48, maxHours: 72 },
    "NO_ANSWER_NO_VM": { minHours: 4, maxHours: 8 },
    "DECLINED": { minHours: 72, maxHours: 120 },
    "BUSY": { minHours: 0.5, maxHours: 2 }
  };
  
  const rule = waitRules[outcome] || waitRules["VOICEMAIL_LEFT"];
  
  // ─────────────────────────────────────────────────────────────────────────
  // CALCULATE NEXT ATTEMPT TIME
  // ─────────────────────────────────────────────────────────────────────────
  
  let nextAttemptTime;
  
  // Start with minimum wait
  const minWait = new Date(Date.now() + rule.minHours * 60 * 60 * 1000);
  
  // Try to align with predicted best time
  if (prediction.confidence !== "LOW") {
    const bestSlot = prediction.recommendations[0];
    nextAttemptTime = findNextMatchingSlot(minWait, bestSlot, lead.timezone);
  } else {
    // Use random time within wait window
    const waitMs = rule.minHours * 60 * 60 * 1000 + 
                   Math.random() * (rule.maxHours - rule.minHours) * 60 * 60 * 1000;
    nextAttemptTime = new Date(Date.now() + waitMs);
  }
  
  // Ensure within calling hours
  nextAttemptTime = adjustForCallingHours(nextAttemptTime, lead.timezone);
  
  // ─────────────────────────────────────────────────────────────────────────
  // VARY ATTEMPT TIMES (avoid patterns)
  // ─────────────────────────────────────────────────────────────────────────
  
  const previousTimes = (await getAttemptHistory(lead.id)).map(a => getHour(a.timestamp, lead.timezone));
  
  // If we've tried at this hour before, shift by 2-3 hours
  const proposedHour = getHour(nextAttemptTime, lead.timezone);
  if (previousTimes.includes(proposedHour)) {
    const shift = (Math.random() > 0.5 ? 2 : -2) + (Math.random() - 0.5);
    nextAttemptTime = new Date(nextAttemptTime.getTime() + shift * 60 * 60 * 1000);
    nextAttemptTime = adjustForCallingHours(nextAttemptTime, lead.timezone);
  }
  
  // ─────────────────────────────────────────────────────────────────────────
  // DETERMINE PRIORITY
  // ─────────────────────────────────────────────────────────────────────────
  
  let priority = "NORMAL";
  
  if (session.analytics?.showedInterest) priority = "HIGH";
  if (totalAttempts <= 2) priority = "HIGH";
  if (outcome === "BUSY") priority = "HIGHEST";
  if (totalAttempts >= 6) priority = "LOW";
  
  return {
    scheduledFor: nextAttemptTime.toISOString(),
    priority,
    attemptNumber: totalAttempts + 1,
    predictedBestTime: prediction,
    reason: `Follow-up after ${outcome}`
  };
}
```

---

# 6. REAL-TIME ANALYTICS & MONITORING

## Dashboard Metrics

```javascript
const TRIPLE_DIAL_DASHBOARD = {
  // ═══════════════════════════════════════════════════════════════════════════
  // REAL-TIME METRICS
  // ═══════════════════════════════════════════════════════════════════════════
  realtime: {
    activeCalls: 0,
    activeTripleDialSessions: 0,
    callsInLast5Minutes: 0,
    connectsInLast5Minutes: 0,
    instantConnectionRate: 0 // Rolling 5-min rate
  },
  
  // ═══════════════════════════════════════════════════════════════════════════
  // TODAY'S PERFORMANCE
  // ═══════════════════════════════════════════════════════════════════════════
  today: {
    totalSessions: 150,
    totalDials: 420,          // ~2.8 dials per session (some abort early)
    
    connections: {
      total: 48,
      onDial1: 27,            // 56% of connections
      onDial2: 14,            // 29% of connections
      onDial3: 7              // 15% of connections
    },
    
    connectionRate: {
      overall: 0.32,          // 48/150 = 32%
      dial1Only: 0.18,        // 27/150 = 18% (what we'd get without multi-dial)
      dial1And2: 0.273,       // 41/150 = 27.3%
      withAllThree: 0.32      // 48/150 = 32%
    },
    
    lift: {
      doubleDial: "+52%",     // (41-27)/27 = 52% lift from dial 2
      tripleDial: "+78%"      // (48-27)/27 = 78% lift from dial 2+3
    },
    
    voicemails: {
      left: 85,
      callbacks: 12,
      callbackRate: 0.141
    }
  },
  
  // ═══════════════════════════════════════════════════════════════════════════
  // CALLER ID HEALTH
  // ═══════════════════════════════════════════════════════════════════════════
  callerIdHealth: {
    "+15125551234": {
      label: "Primary",
      status: "HEALTHY",
      callsToday: 120,
      answerRate: 0.22,
      immediateVMRate: 0.15,
      declineRate: 0.08
    },
    "+15125555678": {
      label: "Secondary", 
      status: "HEALTHY",
      callsToday: 95,
      answerRate: 0.19,
      immediateVMRate: 0.18,
      declineRate: 0.10
    },
    "+15125559999": {
      label: "Austin Local",
      status: "WARNING",
      callsToday: 85,
      answerRate: 0.15,
      immediateVMRate: 0.35,  // High - possibly flagged
      declineRate: 0.12,
      alertMessage: "Elevated immediate-VM rate - monitor closely"
    }
  },
  
  // ═══════════════════════════════════════════════════════════════════════════
  // VOICEMAIL SCRIPT PERFORMANCE (A/B Testing)
  // ═══════════════════════════════════════════════════════════════════════════
  vmScriptPerformance: {
    "FIRST_ATTEMPT_STANDARD": {
      variants: {
        "A": { sent: 45, callbacks: 5, rate: 0.111 },
        "B": { sent: 42, callbacks: 7, rate: 0.167 }, // Winner!
        "C": { sent: 40, callbacks: 4, rate: 0.100 }
      },
      winner: "B",
      confidence: 0.85
    },
    "SECOND_ATTEMPT": {
      variants: {
        "A": { sent: 30, callbacks: 5, rate: 0.167 },
        "B": { sent: 28, callbacks: 4, rate: 0.143 }
      },
      winner: null,
      confidence: 0.62  // Not enough data yet
    }
  },
  
  // ═══════════════════════════════════════════════════════════════════════════
  // TIME SLOT PERFORMANCE
  // ═══════════════════════════════════════════════════════════════════════════
  timeSlotPerformance: {
    byHour: {
      "9": { sessions: 15, connections: 3, rate: 0.20 },
      "10": { sessions: 22, connections: 8, rate: 0.36 },  // Best!
      "11": { sessions: 18, connections: 5, rate: 0.28 },
      "12": { sessions: 12, connections: 2, rate: 0.17 },  // Lunch = bad
      "13": { sessions: 10, connections: 2, rate: 0.20 },
      "14": { sessions: 20, connections: 7, rate: 0.35 },
      "15": { sessions: 18, connections: 6, rate: 0.33 },
      "16": { sessions: 16, connections: 6, rate: 0.375 }, // Best!
      "17": { sessions: 12, connections: 5, rate: 0.42 },  // Best!
      "18": { sessions: 7, connections: 3, rate: 0.43 }
    },
    byDayOfWeek: {
      "Monday": { sessions: 25, connections: 6, rate: 0.24 },
      "Tuesday": { sessions: 30, connections: 11, rate: 0.37 },
      "Wednesday": { sessions: 35, connections: 14, rate: 0.40 }, // Best!
      "Thursday": { sessions: 32, connections: 10, rate: 0.31 },
      "Friday": { sessions: 20, connections: 5, rate: 0.25 },
      "Saturday": { sessions: 8, connections: 2, rate: 0.25 }
    }
  }
};
```

## Alerting System

```javascript
const ALERTING_CONFIG = {
  // ═══════════════════════════════════════════════════════════════════════════
  // CALLER ID ALERTS
  // ═══════════════════════════════════════════════════════════════════════════
  callerIdAlerts: {
    immediateVMSpike: {
      threshold: 0.40,       // >40% immediate VM
      window: 20,            // Over last 20 calls
      action: "WARN_AND_ROTATE",
      notification: {
        slack: "#dialer-alerts",
        message: "⚠️ Caller ID {number} may be flagged as spam (immediate VM rate: {rate})"
      }
    },
    
    answerRateDrop: {
      threshold: 0.08,       // <8% answer rate
      window: 50,            // Over last 50 calls
      action: "ROTATE_OUT",
      notification: {
        slack: "#dialer-alerts",
        urgency: "HIGH",
        message: "🚨 Caller ID {number} answer rate critical ({rate}) - rotating out"
      }
    }
  },
  
  // ═══════════════════════════════════════════════════════════════════════════
  // PERFORMANCE ALERTS
  // ═══════════════════════════════════════════════════════════════════════════
  performanceAlerts: {
    connectionRateDrop: {
      threshold: 0.15,       // Below 15% is concerning
      window: "1h",          // Over last hour
      action: "INVESTIGATE",
      notification: {
        slack: "#dialer-alerts",
        message: "📉 Overall connection rate dropped to {rate} in last hour"
      }
    },
    
    errorRateSpike: {
      threshold: 0.05,       // >5% errors
      window: 50,
      action: "PAUSE_AND_INVESTIGATE",
      notification: {
        slack: "#dialer-alerts",
        urgency: "CRITICAL",
        message: "🛑 High error rate detected ({rate}) - pausing dialer"
      }
    }
  }
};

async function monitorAndAlert() {
  // Run every minute
  const metrics = await collectRealTimeMetrics();
  
  // Check caller ID health
  for (const [number, health] of Object.entries(metrics.callerIdHealth)) {
    if (health.immediateVMRate > ALERTING_CONFIG.callerIdAlerts.immediateVMSpike.threshold) {
      await handleAlert("immediateVMSpike", { number, rate: health.immediateVMRate });
    }
    
    if (health.answerRate < ALERTING_CONFIG.callerIdAlerts.answerRateDrop.threshold) {
      await handleAlert("answerRateDrop", { number, rate: health.answerRate });
    }
  }
  
  // Check overall performance
  if (metrics.today.connectionRate.overall < ALERTING_CONFIG.performanceAlerts.connectionRateDrop.threshold) {
    await handleAlert("connectionRateDrop", { rate: metrics.today.connectionRate.overall });
  }
}
```

---

# 7. NOTES INTEGRATION

## Triple-Dial Notes Structure

```javascript
// Addition to CallNotes structure
const TripleDialNotes = {
  // ═══════════════════════════════════════════════════════════════════════════
  // DIAL SESSION TRACKING
  // ═══════════════════════════════════════════════════════════════════════════
  dialSession: {
    sessionId: "uuid",
    totalDials: 3,
    connectedOnDial: 2,  // null if no connect
    
    dial1: {
      timestamp: "2024-01-15T14:30:00Z",
      callerId: "+15125551234",
      callerIdLabel: "Primary",
      outcome: "NO_ANSWER",
      rings: 4,
      duration: 22,
      pattern: "RANG_FULL",
      analysis: {
        suspectedBlock: false,
        ringBehavior: "NORMAL"
      }
    },
    
    dial2: {
      timestamp: "2024-01-15T14:30:08Z",
      callerId: "+15125555678",
      callerIdLabel: "Secondary",
      outcome: "ANSWERED",
      rings: 2,
      duration: 847,
      pattern: "QUICK_ANSWER",
      analysis: {
        likelyRecognizedPattern: true
      },
      connectedToFlow: true,
      callOutcome: "APPOINTMENT_SET"
    },
    
    dial3: null, // Not needed - connected on dial 2
    
    delayBetweenDials: {
      dial1ToDial2: 5.2,
      dial2ToDial3: null
    },
    
    sessionOutcome: "CONNECTED_DIAL_2",
    sessionDuration: 855, // Total session time
    tripleDialSuccess: true,
    dialNumberThatConnected: 2
  },
  
  // ═══════════════════════════════════════════════════════════════════════════
  // VOICEMAIL TRACKING (if left)
  // ═══════════════════════════════════════════════════════════════════════════
  voicemail: {
    left: false,
    afterDial: null,
    scriptId: null,
    scriptVariant: null,
    scriptContent: null,
    duration: null,
    timestamp: null,
    
    // A/B test tracking
    abTest: {
      testId: null,
      variant: null
    },
    
    // Response tracking
    callback: {
      received: false,
      receivedAt: null,
      hoursToCallback: null
    }
  },
  
  // ═══════════════════════════════════════════════════════════════════════════
  // ATTEMPT HISTORY (for this lead across all sessions)
  // ═══════════════════════════════════════════════════════════════════════════
  attemptHistory: {
    totalSessions: 2,
    totalDials: 5,  // 3 in first session, 2 in second (connected)
    totalConnections: 1,
    connectionRate: 0.50,  // 1/2 sessions
    
    sessions: [
      {
        date: "2024-01-13",
        sessionId: "uuid-1",
        dials: 3,
        outcome: "VOICEMAIL_LEFT",
        voicemailScript: "FIRST_ATTEMPT_STANDARD"
      },
      {
        date: "2024-01-15",
        sessionId: "uuid-2",
        dials: 2,
        outcome: "CONNECTED_DIAL_2",
        callOutcome: "APPOINTMENT_SET"
      }
    ],
    
    bestTimeAnalysis: {
      connectedAt: ["Wednesday 2:30pm"],
      failedAt: ["Monday 10:15am"],
      recommendedTime: "Weekday afternoons",
      confidence: "MEDIUM"
    }
  },
  
  // ═══════════════════════════════════════════════════════════════════════════
  // CALLER ID PERFORMANCE (for this lead)
  // ═══════════════════════════════════════════════════════════════════════════
  callerIdPerformance: {
    numbersUsed: ["+15125551234", "+15125555678"],
    connectionByNumber: {
      "+15125551234": { attempts: 4, connections: 0 },
      "+15125555678": { attempts: 1, connections: 1 }  // This one worked!
    },
    recommendation: "Use Secondary number for this lead"
  },
  
  // ═══════════════════════════════════════════════════════════════════════════
  // NEXT ATTEMPT SCHEDULING
  // ═══════════════════════════════════════════════════════════════════════════
  nextAttempt: {
    scheduled: false, // Connected, so no next attempt needed for calling
    followUpScheduled: true,
    followUpType: "APPOINTMENT_REMINDER",
    followUpDate: "2024-01-17T14:00:00Z"
  }
};
```

---

# 8. CONFIGURATION SUMMARY

## Complete Triple-Dial Config

```javascript
const MASTER_TRIPLE_DIAL_CONFIG = {
  // Core
  enabled: true,
  maxDials: 3,
  
  // Timing
  timing: {
    dial1ToDial2: { baseDelay: 5, min: 3, max: 10, adaptive: true },
    dial2ToDial3: { baseDelay: 8, min: 5, max: 15, adaptive: true }
  },
  
  // Rings per dial
  rings: {
    dial1: { maxRings: 4 },
    dial2: { maxRings: 5 },
    dial3: { maxRings: 6 }
  },
  
  // Caller ID
  callerId: {
    rotation: "PROGRESSIVE",
    areaCodeMatching: true,
    healthMonitoring: true,
    healthThresholds: {
      immediateVMRate: 0.40,
      declineRate: 0.30,
      answerRate: 0.10
    }
  },
  
  // Spam mitigation
  spamMitigation: {
    maxCallsPerHourPerNumber: 30,
    maxCallsPerDayPerNumber: 200,
    burstProtection: true,
    cooldownOnFlag: 72 // hours
  },
  
  // Limits
  limits: {
    maxTripleDialSessionsPerDay: 1,
    maxTotalAttemptsPerWeek: 5,
    maxTotalAttemptsEver: 10,
    maxVoicemailsEver: 4
  },
  
  // Voicemail
  voicemail: {
    leaveAfter: "DIAL_3",
    abTesting: true,
    maxDuration: 35
  },
  
  // Scheduling
  scheduling: {
    usePredictiveBestTime: true,
    varyAttemptTimes: true,
    callingHours: {
      weekday: { start: 9, end: 20 },
      saturday: { start: 10, end: 18 },
      sunday: null
    }
  },
  
  // Analytics
  analytics: {
    trackAllDials: true,
    trackVMPerformance: true,
    trackCallerIdHealth: true,
    dashboardRefresh: 60 // seconds
  },
  
  // Alerting
  alerting: {
    enabled: true,
    slackChannel: "#dialer-alerts",
    alertOnSpamFlag: true,
    alertOnPerformanceDrop: true
  }
};
```

---

# EXPECTED RESULTS

| Metric | Single Dial | Double Dial | Triple Dial |
|--------|-------------|-------------|-------------|
| Connection Rate | 18% | 26% | 32% |
| Lift vs Single | - | +44% | +78% |
| Contacts/100 Leads | 18 | 26 | 32 |
| Cost per Contact | $5.56 | $4.23 | $3.65 |

**With full optimization (best time, caller ID rotation, A/B tested scripts):**
- Expected connection rate: **35-40%**
- Expected VM callback rate: **15-20%**
- Total effective contact rate: **45-50%**

---

*End of State-of-the-Art Triple-Dial System Specification*
