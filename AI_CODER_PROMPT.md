You are an expert full-stack developer and LiveKit architecture specialist. We have a React frontend (`@livekit/components-react`) and a dynamic backend architecture managing an AI/Human Call Center.

**Current Architecture & Critical Architecture Flaw:**
Right now, our app allows an agent (Helen) to go online to listen to calls. The flaw is: 
1. When a 3rd person connects to the queue, the frontend correctly *shows* them they are "in queue".
2. **However, they are actually connected to the SAME LiveKit room** as the active call. They can currently act as a conference participant and hear the first two people talking.
3. The room logic (`useCallSession.js` & token issuance) is putting all callers into a single room.
4. The agent dashboard (`ReceiverInterface.jsx`) relies on `room.remoteParticipants.size` as a makeshift queue, which is an anti-pattern and highly insecure.

**Your Objective:**
Refactor the system to enforce strict **1-ON-1 ROOM ISOLATION**, implement an isolated queue experience using AI TTS, and upgrade the Receiver (Agent) Dashboard to handle multiple dynamic sessions properly. The logic needs to be rock-solid, secure, and production-grade ("like a pro").

Please implement the following architectural changes:

### 1. Strict Room Isolation (Backend & Frontend token logic)
- **New Calls = Unique Rooms:** The backend `/livekit/caller-token` must generate and return a UNIQUE room ID (e.g., `call-{timestamp}-{uuid}`) for EVERY new caller. 
- **Frontend Changes (`useCallSession.js` & `CallInterface.jsx`):** Ensure the frontend connects properly to this newly returned dynamic room. Remove any hardcoded `roomName` logic.
- **Outcome:** No caller should ever share a room with another waiting caller.

### 2. Intelligent Queue & Real-time TTS Loop (Backend)
- **First-Come-First-Serve (FIFO) Queue:** Maintain a global or Redis-based strict queue on the backend to track caller order and wait times accurately.
- **Dedicated Queue TTS (The "Wait Room"):** When a caller is placed in the queue, their unique LiveKit room should have a backend-driven TTS Agent (like Piper or OpenAI realtime) join.
- **Custom Periodic Messages:** The TTS agent should play a highly customizable TTS message: *"Helen is currently busy, your wait time is roughly X minutes."* Implement a loop that replays a message every 1 to 5 minutes (make the time interval configurable) so the waiting caller isn't left in total silence.
- **Auto-Disconnect TTS:** When the agent (Helen) successfully accepts the caller, the backend must immediately kick/disconnect the TTS agent from that unique room to avoid interruption.

### 3. Agent (Receiver) Dashboard Upgrades (`ReceiverInterface.jsx`)
- **Decouple Queue from Room Participants:** The Receiver dashboard should **NOT** natively be connected to a LiveKit room immediately just to check for a queue size.
- **Live Queue Polling or WebSocket:** Implement a real-time data fetch or SSE polling endpoint (e.g., `/livekit/queue-status`) so Helen can see an actual visual queue list (e.g., Caller ID, Wait Time, Position).
- **Incoming Call Notification Popup:** When a new call enters the backend queue, trigger a clean UI popup/toast notification in the Receiver Interface: *"New incoming call from [ID]"*.
- **"Accept Call" Flow:** When Helen clicks "Accept" on a specific person in the queue UI:
  1. The backend issues Helen a token specifically for that caller's unique room.
  2. The frontend connects Helen's `LiveKitRoom` to that room.
  3. The backend concurrently boots the TTS Wait Agent from that room.
  4. Helen and the Caller are now in a private, completely isolated 1-on-1 WebRTC session.

### Files to Modify / Focus On:
- **Frontend:**
  - `src/hooks/useCallSession.js` (Token fetching, capturing dynamic room assignments)
  - `src/components/ReceiverInterface.jsx` (Ditch the native room participant counter, build a real visual queue UI, trigger popup notifications, dynamically join selected rooms on click)
  - `src/components/CallInterface.jsx` (Ensure it renders the completely isolated connection)
- **Backend (What the AI Coder must update):**
  - Token API (`/livekit/caller-token`) and caller queue lifecycle.
  - Adding a stateful Queue Manager.
  - Adding the LiveKit Server-side Agent execution for the wait-time TTS loop.

Generate the exact, robust code required to fix both the React frontend and the necessary backend endpoint structure. Optimize for security, speed, and session lifecycle management.
