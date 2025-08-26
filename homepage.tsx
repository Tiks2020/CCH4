"use client"

import type React from "react"

import { useState, useRef, useEffect, useMemo } from "react"
import { useUneeq } from "@/hooks/useUneeq"
import UneeqScript from "@/app/components/UneeqScript"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Slider } from "@/components/ui/slider"
import { Switch } from "@/components/ui/switch"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import {
  User,
  Video,
  Sparkles,
  Wrench,
  Headphones,
  ClipboardList,
  Play,
  PhoneOff,
  Stethoscope,
  BarChart3,
  Download,
  X,
} from "lucide-react"

// Declare global uneeq variable
declare global {
  interface Window {
    uneeq: any
  }
}

export default function Component() {
  const [localShowAssessmentScale, setLocalShowAssessmentScale] = useState(false)
  const [volume, setVolume] = useState([75])
  const [pitch, setPitch] = useState([50])
  const [showClosedCaptions, setShowClosedCaptions] = useState(false)
  const [showLargeText, setShowLargeText] = useState(false)
  const [isInConversation, setIsInConversation] = useState(false)
  const [showPinDialog, setShowPinDialog] = useState(false)
  const [showEndSessionDialog, setShowEndSessionDialog] = useState(false)
  const [showAnalytics, setShowAnalytics] = useState(false)
  const [pin, setPin] = useState(["", "", "", ""])
  const [endPin, setEndPin] = useState(["", "", "", ""])
  const [pinError, setPinError] = useState("")
  const [endPinError, setEndPinError] = useState("")
  const [patientId, setPatientId] = useState("")
  const [assessmentResponses, setAssessmentResponses] = useState<Array<{
    questionNumber: number;
    question: string;
    score: number | "skip";
    scoreText: string;
    timestamp: string;
    isCritical: boolean;
  }>>([])
  const [sessionStartTime, setSessionStartTime] = useState<Date | null>(null)
  const longPressTimer = useRef<NodeJS.Timeout | null>(null)
  const [isModalClosing, setIsModalClosing] = useState(false)
  const [isSessionStarting, setIsSessionStarting] = useState(false)
  const [isModalOpening, setIsModalOpening] = useState(false)
  const [showLoadingScreen, setShowLoadingScreen] = useState(false)
  const [isWaitingForReportBeforeEnd, setIsWaitingForReportBeforeEnd] = useState(false)

  // Initialize Uneeq hook
  const { 
    scriptStatus, 
    readyToStart, 
    avatarLive, 
    showAssessmentScale,
    setShowAssessmentScale,
    currentQuestionNumber,
    lastResponse,
    startSession, 
    endSession,
    sendMessage,
    dimAvatarActive,
    showSurveyModal,
    setShowSurveyModal,
    uneeqReportData,
    isRequestingReport,
    requestReport
  } = useUneeq(undefined, showClosedCaptions, localShowAssessmentScale, showLargeText)

  const CORRECT_PIN = "1234"

  // Function to get question text based on question number
  const getQuestionText = (questionNumber: number): string => {
    const questions = {
      1: "In the past two weeks, have you felt like you didn't enjoy things you usually like?",
      2: "Have you been feeling sad, down, or like things might not get better?",
      3: "Has it been hard to sleep—either too much or not enough?",
      4: "Have you been feeling really tired, even when you rest?",
      5: "Have you been eating way less, or a lot more, than usual?",
      6: "Have you felt bad about yourself, or like you've let yourself or your family down?",
      7: "Has it been hard to focus, like when reading or watching TV?",
      8: "Have people noticed you moving or speaking more slowly, or being really restless?",
      9: "Have you had any thoughts about not wanting to be here—or hurting yourself?"
    };
    return questions[questionNumber as keyof typeof questions] || questions[1];
  };

  // Function to handle assessment scale button clicks
  const handleAssessmentResponse = (score: number | "skip") => {
    console.log(`Assessment response for question ${currentQuestionNumber}: ${score}`);
    
    // Convert score to speech text for the digital human
    let speechText = "";
    let scoreText = "";
    if (score === "skip") {
      speechText = "I would like to skip this question";
      scoreText = "Skip";
    } else {
      const scoreLabels = {
        0: "Not at all",
        1: "Several days", 
        2: "More than half the days",
        3: "Nearly every day"
      };
      speechText = scoreLabels[score as keyof typeof scoreLabels] || "Not at all";
      scoreText = scoreLabels[score as keyof typeof scoreLabels] || "Not at all";
    }
    
    // Store the assessment response
    const newResponse = {
      questionNumber: currentQuestionNumber,
      question: getQuestionText(currentQuestionNumber),
      score: score,
      scoreText: scoreText,
      timestamp: new Date().toLocaleTimeString(),
      isCritical: score === 3 // Mark as critical if score is 3 (Nearly every day)
    };
    
    setAssessmentResponses(prev => [...prev, newResponse]);
    
    // Send the response as speech input to the digital human
    if (avatarLive) {
      console.log(`Sending assessment response as speech: "${speechText}"`);
      // Use the sendMessage function from useUneeq hook to send speech input
      // This will make the digital human hear the selected response
      sendMessage(speechText);
    }
    
    // Hide the assessment scale after sending the response
    setShowAssessmentScale(false);
  };

  // Handle Uneeq session management
  useEffect(() => {
    if (isInConversation && readyToStart && !avatarLive) {
      console.log('Starting Uneeq session...');
      setShowLoadingScreen(true); // Show loading screen
      startSession();
    } else if (!isInConversation && avatarLive) {
      console.log('Ending Uneeq session...');
      endSession();
      setShowLoadingScreen(false); // Hide loading screen
    }
  }, [isInConversation, readyToStart, avatarLive, startSession, endSession])

  // Hide loading screen after Sophie is live and minimum time has passed
  useEffect(() => {
    if (avatarLive && showLoadingScreen) {
      const timer = setTimeout(() => {
        setShowLoadingScreen(false);
      }, 4000); // Show loading screen for at least 4 seconds to ensure Sophie is visible
      return () => clearTimeout(timer);
    }
  }, [avatarLive, showLoadingScreen]);

  // Real session analytics data based on actual assessment responses
  const sessionAnalytics = useMemo(() => {
    // Use Uneeq report data if available, fallback to local data
    const reportQuestions = uneeqReportData?.questions || [];
    const reportTotal = uneeqReportData?.total || 0;
    
    return {
      sessionId: "SES-2024-001",
      patientId: patientId || "No Patient ID",
      startTime: sessionStartTime ? sessionStartTime.toLocaleString() : "",
      endTime: "", // Will be set when session ends
      duration: sessionStartTime ? `${Math.floor((Date.now() - sessionStartTime.getTime()) / 60000)} minutes` : "",
      character: "Sunny the Tiger",
      hasCriticalResponses: reportQuestions.some(q => q.flagged),
      criticalCount: reportQuestions.filter(q => q.flagged).length,
      totalScore: reportTotal,
      responses: reportQuestions.map(q => ({
        question: getQuestionText(q.question),
        options: ["Not at all", "Several days", "More than half the days", "Nearly every day", "Skip"],
        selected: q.score,
        selectedText: ["Not at all", "Several days", "More than half the days", "Nearly every day", "Skip"][q.score] || "Unknown",
        timestamp: new Date().toLocaleTimeString(), // Use current time since we don't have timestamps
        isCritical: q.flagged,
      })),
    };
  }, [patientId, sessionStartTime, uneeqReportData])

  const criticalResponses = sessionAnalytics.responses.filter((r) => r.isCritical)

  const handleStartConversation = () => {
    setIsModalOpening(true)
    setShowPinDialog(true)
    // Reset opening state after animation
    setTimeout(() => {
      setIsModalOpening(false)
    }, 400)
  }



  const handlePinChange = (index: number, value: string) => {
    if (value.length > 1) return // Only allow single digits

    const newPin = [...pin]
    newPin[index] = value
    setPin(newPin)

    // Auto-focus next input
    if (value && index < 3) {
      const nextInput = document.getElementById(`pin-${index + 1}`)
      nextInput?.focus()
    }
  }

  const handleEndPinChange = (index: number, value: string) => {
    if (value.length > 1) return // Only allow single digits

    const newPin = [...endPin]
    newPin[index] = value
    setEndPin(newPin)

    // Auto-focus next input
    if (value && index < 3) {
      const nextInput = document.getElementById(`end-pin-${index + 1}`)
      nextInput?.focus()
    }
  }

  const handlePinKeyDown = (index: number, e: React.KeyboardEvent) => {
    if (e.key === "Backspace" && !pin[index] && index > 0) {
      const prevInput = document.getElementById(`pin-${index - 1}`)
      prevInput?.focus()
    }

    if (e.key === "Enter" && pin.every((digit) => digit !== "")) {
      handlePinSubmit()
    }
  }

  const handleEndPinKeyDown = (index: number, e: React.KeyboardEvent) => {
    if (e.key === "Backspace" && !endPin[index] && index > 0) {
      const prevInput = document.getElementById(`end-pin-${index - 1}`)
      prevInput?.focus()
    }

    if (e.key === "Enter" && endPin.every((digit) => digit !== "")) {
      handleEndPinSubmit()
    }
  }

  const handlePinSubmit = () => {
    const enteredPin = pin.join("")
    if (enteredPin === CORRECT_PIN) {
      // Reset assessment responses for new session
      setAssessmentResponses([])
      setSessionStartTime(new Date())
      
      setIsSessionStarting(true)

      // Start the transition animation
      setTimeout(() => {
        setShowPinDialog(false)
        setIsInConversation(true)
        setPin(["", "", "", ""])
        setPinError("")
        setIsSessionStarting(false)
        
        // Request report from Uneeq after session starts
        setTimeout(() => {
          requestReport();
        }, 1000); // Wait for session to be fully established
      }, 800)
    } else {
      setPinError("Incorrect PIN. Please contact your administrator for access.")
      setPin(["", "", "", ""])
      // Focus first input after error
      setTimeout(() => {
        const firstInput = document.getElementById("pin-0")
        firstInput?.focus()
      }, 100)
    }
  }

  const handleEndPinSubmit = () => {
    const enteredPin = endPin.join("")
    if (enteredPin === CORRECT_PIN) {
      setIsModalClosing(true)

      // Start the transition animation
      setTimeout(() => {
        setShowEndSessionDialog(false)
        setEndPin(["", "", "", ""])
        setEndPinError("")
        setIsModalClosing(false)

        // Request report first, then end session after receiving it
        setIsWaitingForReportBeforeEnd(true)
        requestReport()
      }, 400)
    } else {
      setEndPinError("Incorrect PIN. Please contact your administrator for access.")
      setEndPin(["", "", "", ""])
      // Focus first input after error
      setTimeout(() => {
        const firstInput = document.getElementById("end-pin-0")
        firstInput?.focus()
      }, 100)
    }
  }

  const handlePinCancel = () => {
    setIsModalClosing(true)
    setTimeout(() => {
      setShowPinDialog(false)
      setPin(["", "", "", ""])
      setPinError("")
      setIsModalClosing(false)
    }, 400)
  }

  const handleEndPinCancel = () => {
    setIsModalClosing(true)
    setTimeout(() => {
      setShowEndSessionDialog(false)
      setEndPin(["", "", "", ""])
      setEndPinError("")
      setIsModalClosing(false)
    }, 400)
  }

  const handleLongPressStart = () => {
    setIsModalOpening(true)
    setShowEndSessionDialog(true)
    setTimeout(() => {
      setIsModalOpening(false)
    }, 400)
  }

  const handleLongPressEnd = () => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current)
      longPressTimer.current = null
    }
  }

  const handlePinKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      handlePinSubmit()
    }
  }

  const handleDoubleClick = () => {
    setShowEndSessionDialog(true)
  }

  // Function to reset accessibility settings to default (off)
  const resetAccessibilitySettings = () => {
    setLocalShowAssessmentScale(false)
    setShowClosedCaptions(false)
    setShowLargeText(false)
    setPatientId("") // Clear patient ID
    console.log('🔄 Accessibility settings and patient ID reset to default')
  }

  const handleCloseAnalytics = () => {
    setIsModalClosing(true)
    setTimeout(() => {
      setShowAnalytics(false)
      setIsModalClosing(false)
      
      // Reset accessibility settings and patient ID after analytics are closed
      resetAccessibilitySettings()
    }, 400)
  }

  const getResponseColor = (value: number, isCritical = false) => {
    if (isCritical) {
      return "from-red-600/90 to-red-700/90 border-red-400/50" // Enhanced critical styling
    }

    const colors = [
      "from-green-500/80 to-green-600/80", // 0 - Best
      "from-yellow-500/80 to-yellow-600/80", // 1 - Good
      "from-orange-500/80 to-orange-600/80", // 2 - Okay
      "from-red-500/80 to-red-600/80", // 3 - Concerning
    ]
    return colors[value] || colors[2]
  }

  const handleDownloadReport = () => {
    // Implement download report functionality here
  }

  // Effect to handle ending session after report is received
  useEffect(() => {
    if (isWaitingForReportBeforeEnd && uneeqReportData && !isRequestingReport) {
      console.log('📊 Report received, now ending session...')
      setIsWaitingForReportBeforeEnd(false)
      
      // End the session
      setIsInConversation(false)
      
      // Show analytics after a short delay
      setTimeout(() => {
        setShowAnalytics(true)
      }, 300)
    }
  }, [isWaitingForReportBeforeEnd, uneeqReportData, isRequestingReport])

  return (
    <div className="min-h-screen bg-gray-950 text-white font-['gg_sans','Whitney','Helvetica_Neue',Helvetica,Arial,sans-serif]">
      <UneeqScript />
      {/* Header */}
      <div className="border-b border-gray-700 px-6 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-8 h-8 bg-gradient-to-r from-orange-400 to-yellow-500 rounded-lg flex items-center justify-center">
              <Video className="w-5 h-5 text-white" />
            </div>
            <h1 className={`${showLargeText ? "text-2xl" : "text-xl"} font-semibold`}>DigitalBuddy</h1>
          </div>
          <div className="flex items-center gap-4">
            <div
              className={`px-3 py-1 rounded-lg flex items-center gap-1 text-sm transition-all duration-1000 ${
                isSessionStarting
                  ? "bg-yellow-500/30 text-yellow-200 animate-pulse"
                  : isInConversation
                    ? "bg-green-500/20 text-green-300"
                    : "bg-orange-500/20 text-orange-300"
              }`}
            >
              <Wrench className="w-3 h-3" />
              {isSessionStarting ? "Initializing..." : isInConversation ? "Active Session" : "Setup Mode"}
            </div>

            {/* Clinician End Session Button - Only visible during conversation */}
            {isInConversation && (
              <Button
                size="sm"
                onMouseDown={handleLongPressStart}
                onMouseUp={handleLongPressEnd}
                onMouseLeave={handleLongPressEnd}
                onTouchStart={handleLongPressStart}
                onTouchEnd={handleLongPressEnd}
                onDoubleClick={handleDoubleClick}
                className="px-3 py-1 bg-red-500/20 hover:bg-red-500/40 text-red-300 hover:text-red-200 border border-red-500/30 hover:border-red-500/50 text-sm transition-all select-none"
                title="Clinician: Long press or double-click to end session"
              >
                <Stethoscope className="w-3 h-3 mr-1" />
                End Session
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* PIN Dialog Overlay */}
      {showPinDialog && (
        <div
          className={`fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4 transition-all duration-400 ease-out ${
            isModalClosing || (isSessionStarting && !isModalOpening)
              ? "opacity-0"
              : isModalOpening
                ? "opacity-0"
                : "opacity-100"
          }`}
        >
          <Card
            className={`bg-gray-800 border-gray-700 w-full max-w-xs transition-all duration-400 ease-out ${
              isModalClosing || (isSessionStarting && !isModalOpening)
                ? "opacity-0 translate-y-6"
                : isModalOpening
                  ? "opacity-0 translate-y-6"
                  : "opacity-100 translate-y-0"
            }`}
          >
            <CardHeader className="text-center">
              <div
                className={`w-16 h-16 bg-blue-500/20 rounded-full flex items-center justify-center mx-auto mb-4 transition-all duration-700 ${isSessionStarting ? "scale-110 bg-green-500/30" : "scale-100"}`}
              >
                <Stethoscope
                  className={`w-8 h-8 transition-all duration-700 ${isSessionStarting ? "text-green-400 scale-110" : "text-blue-400"}`}
                />
              </div>
              <CardTitle className={`${showLargeText ? "text-xl" : "text-lg"} text-white transition-all duration-500`}>
                {isSessionStarting ? "Starting Session..." : "Clinician Authorization Required"}
              </CardTitle>
              <p
                className={`${showLargeText ? "text-base" : "text-sm"} text-gray-300 mt-2 transition-all duration-500`}
              >
                {isSessionStarting
                  ? "Preparing therapeutic environment..."
                  : "Please enter your clinician PIN to begin the therapeutic session with the patient."}
              </p>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label className={`${showLargeText ? "text-base" : "text-sm"} text-gray-300 mb-2 block`}>
                  Patient ID
                </Label>
                <Input
                  type="text"
                  value={patientId}
                  onChange={(e) => setPatientId(e.target.value)}
                  placeholder="Enter patient ID"
                  className={`w-full text-center text-lg font-medium bg-gray-700 border-gray-600 text-white transition-all duration-300 ${showLargeText ? "text-xl" : "text-lg"} ${isSessionStarting ? "border-green-500/50 bg-green-500/10" : ""}`}
                  disabled={isSessionStarting}
                />
              </div>
              <div>
                <Label className={`${showLargeText ? "text-base" : "text-sm"} text-gray-300 mb-2 block`}>
                  Clinician PIN
                </Label>
                <div className="flex gap-3 justify-center mb-2">
                  {pin.map((digit, index) => (
                    <Input
                      key={index}
                      id={`pin-${index}`}
                      type="text"
                      inputMode="numeric"
                      pattern="[0-9]"
                      maxLength={1}
                      value={digit}
                      onChange={(e) => handlePinChange(index, e.target.value.replace(/\D/g, ""))}
                      onKeyDown={(e) => handlePinKeyDown(index, e)}
                      className={`w-12 h-12 text-center text-xl font-bold bg-gray-700 border-gray-600 text-white transition-all duration-300 ${showLargeText ? "text-2xl" : "text-xl"} ${isSessionStarting ? "border-green-500/50 bg-green-500/10" : ""}`}
                      autoFocus={index === 0}
                      disabled={isSessionStarting}
                    />
                  ))}
                </div>
                {pinError && (
                  <p
                    className={`${showLargeText ? "text-base" : "text-sm"} text-red-400 mt-2 text-center transition-all duration-300`}
                  >
                    {pinError}
                  </p>
                )}
              </div>
              <div className="space-y-3">
                <Button
                  onClick={handlePinSubmit}
                  className={`${showLargeText ? "text-base" : "text-sm"} w-full transition-all duration-500 ${
                    isSessionStarting
                      ? "bg-gradient-to-r from-green-500 to-green-600 hover:from-green-600 hover:to-green-700"
                      : "bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700"
                  } text-white`}
                  disabled={pin.some((digit) => digit === "") || patientId.trim() === "" || isSessionStarting}
                >
                  {isSessionStarting ? (
                    <span className="flex items-center gap-2">
                      <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                      Starting...
                    </span>
                  ) : (
                    "Begin Session"
                  )}
                </Button>
                <Button
                  onClick={handlePinCancel}
                  variant="outline"
                  className={`${showLargeText ? "text-base" : "text-sm"} w-full border-gray-600 hover:bg-gray-700 text-white bg-transparent transition-all duration-300`}
                  disabled={isSessionStarting}
                >
                  Cancel
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* End Session PIN Dialog Overlay */}
      {showEndSessionDialog && (
        <div
          className={`fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4 transition-all duration-400 ease-out ${
            isModalClosing ? "opacity-0" : isModalOpening ? "opacity-0" : "opacity-100"
          }`}
        >
          <Card
            className={`bg-gray-800 border-gray-700 w-full max-w-xs transition-all duration-400 ease-out ${
              isModalClosing
                ? "opacity-0 translate-y-6"
                : isModalOpening
                  ? "opacity-0 translate-y-6"
                  : "opacity-100 translate-y-0"
            }`}
          >
            <CardHeader className="text-center">
              <div className="w-16 h-16 bg-red-500/20 rounded-full flex items-center justify-center mx-auto mb-4 transition-all duration-300">
                <PhoneOff className="w-8 h-8 text-red-400" />
              </div>
              <CardTitle className={`${showLargeText ? "text-xl" : "text-lg"} text-white`}>
                End Session Authorization
              </CardTitle>
              <p className={`${showLargeText ? "text-base" : "text-sm"} text-gray-300 mt-2`}>
                Please enter your clinician PIN to end the therapeutic session.
              </p>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label className={`${showLargeText ? "text-base" : "text-sm"} text-gray-300 mb-2 block`}>
                  Clinician PIN
                </Label>
                <div className="flex gap-3 justify-center mb-2">
                  {endPin.map((digit, index) => (
                    <Input
                      key={index}
                      id={`end-pin-${index}`}
                      type="text"
                      inputMode="numeric"
                      pattern="[0-9]"
                      maxLength={1}
                      value={digit}
                      onChange={(e) => handleEndPinChange(index, e.target.value.replace(/\D/g, ""))}
                      onKeyDown={(e) => handleEndPinKeyDown(index, e)}
                      className={`w-12 h-12 text-center text-xl font-bold bg-gray-700 border-gray-600 text-white transition-all duration-300 ${showLargeText ? "text-2xl" : "text-xl"}`}
                      autoFocus={index === 0}
                      disabled={isModalClosing}
                    />
                  ))}
                </div>
                {endPinError && (
                  <p className={`${showLargeText ? "text-base" : "text-sm"} text-red-400 mt-2 text-center`}>
                    {endPinError}
                  </p>
                )}
              </div>
              <div className="space-y-3">
                <Button
                  onClick={handleEndPinSubmit}
                  className={`${showLargeText ? "text-base" : "text-sm"} w-full bg-gradient-to-r from-red-500 to-red-600 hover:from-red-600 hover:to-red-700 text-white transition-all duration-300`}
                  disabled={endPin.some((digit) => digit === "") || isModalClosing}
                >
                  {isModalClosing ? (
                    <span className="flex items-center gap-2">
                      <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                      Ending...
                    </span>
                  ) : (
                    "End Session"
                  )}
                </Button>
                <Button
                  onClick={handleEndPinCancel}
                  variant="outline"
                  className={`${showLargeText ? "text-base" : "text-sm"} w-full border-gray-600 hover:bg-gray-700 text-white bg-transparent transition-all duration-300`}
                  disabled={isModalClosing}
                >
                  Cancel
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Session Analytics Modal */}
      {showAnalytics && (
        <div
          className={`fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4 transition-all duration-400 ease-out ${
            isModalClosing ? "opacity-0" : "opacity-100"
          }`}
        >
          <Card
            className={`bg-gray-800 border-gray-700 w-full max-w-4xl max-h-[90vh] overflow-hidden transition-all duration-400 ease-out ${
              isModalClosing ? "opacity-0 translate-y-6" : "opacity-100 translate-y-0"
            }`}
          >
            <CardHeader className="border-b border-gray-700">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 bg-blue-500/20 rounded-full flex items-center justify-center">
                    <BarChart3 className="w-6 h-6 text-blue-400" />
                  </div>
                  <div>
                    <CardTitle className="text-xl text-white">Session Analytics</CardTitle>
                    <p className="text-sm text-gray-400">Therapeutic Assessment Results</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    onClick={handleDownloadReport}
                    className="bg-blue-500/20 hover:bg-blue-500/40 text-blue-300 border border-blue-500/30"
                  >
                    <Download className="w-4 h-4 mr-1" />
                    Export
                  </Button>
                  <Button
                    size="sm"
                    onClick={handleCloseAnalytics}
                    variant="outline"
                    className="border-gray-600 hover:bg-gray-700 text-white bg-transparent"
                  >
                    <X className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-6 overflow-y-auto max-h-[calc(90vh-120px)]">
              {/* Session Summary */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                <div className="bg-gray-700/50 rounded-lg p-3">
                  <p className="text-xs text-gray-400 uppercase tracking-wide">Patient ID</p>
                  <p className="text-sm font-medium text-white">{sessionAnalytics.patientId}</p>
                </div>
                <div className="bg-gray-700/50 rounded-lg p-3">
                  <p className="text-xs text-gray-400 uppercase tracking-wide">Duration</p>
                  <p className="text-sm font-medium text-white">{sessionAnalytics.duration}</p>
                </div>
                <div className="bg-gray-700/50 rounded-lg p-3">
                  <p className="text-xs text-gray-400 uppercase tracking-wide">Character</p>
                  <p className="text-sm font-medium text-white">{sessionAnalytics.character}</p>
                </div>
                <div className="bg-gray-700/50 rounded-lg p-3">
                  <p className="text-xs text-gray-400 uppercase tracking-wide">Questions</p>
                  <p className="text-sm font-medium text-white">{sessionAnalytics.responses.length}/9</p>
                </div>
                <div className="bg-gray-700/50 rounded-lg p-3">
                  <p className="text-xs text-gray-400 uppercase tracking-wide">Total Score</p>
                  <p className="text-sm font-medium text-white">{sessionAnalytics.totalScore || "N/A"}</p>
                </div>
              </div>

              {/* Assessment Responses */}
              <div className="space-y-4">
                <h3 className="text-lg font-semibold text-white mb-4">Assessment Responses</h3>
                {isRequestingReport || isWaitingForReportBeforeEnd ? (
                  <div className="text-center py-8">
                    <div className="animate-spin w-8 h-8 border-2 border-orange-500 border-t-transparent rounded-full mx-auto mb-4"></div>
                    <p className="text-gray-300">
                      {isWaitingForReportBeforeEnd ? "Retrieving final session data..." : "Loading session report..."}
                    </p>
                  </div>
                ) : sessionAnalytics.responses.length === 0 ? (
                  <p className="text-gray-400 text-center py-8">No assessment responses yet. Complete the assessment questions to see responses here.</p>
                ) : (
                  sessionAnalytics.responses.map((response, index) => (
                  <div key={index} className="bg-gray-700/30 rounded-lg p-4 border border-gray-600/50">
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex-1">
                        <h4 className="text-sm font-medium text-white mb-2">
                          {response.question}
                        </h4>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                          {["Not at all", "Several days", "More than half the days", "Nearly every day", "Skip"].map((option, optionIndex) => (
                            <div
                              key={optionIndex}
                              className={`p-2 rounded-lg border transition-all ${
                                optionIndex === response.selected
                                  ? `bg-gradient-to-r ${getResponseColor(response.selected, response.isCritical)} border-white/20 text-white`
                                  : "bg-gray-800/50 border-gray-600/30 text-gray-400"
                              }`}
                            >
                              <div className="flex items-center gap-2">
                                <div
                                  className={`w-4 h-4 rounded-full flex items-center justify-center text-xs font-bold ${
                                    optionIndex === response.selected
                                      ? "bg-white/30 text-white"
                                      : "bg-gray-600/50 text-gray-500"
                                  }`}
                                >
                                  {optionIndex === 4 ? "-" : optionIndex}
                                </div>
                                <span className="text-sm">{option}</span>
                                {optionIndex === response.selected && (
                                  <span className="ml-auto text-xs font-medium">✓ Selected</span>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                      <div className="ml-4 text-right">
                        <p className="text-xs text-gray-400">Answered at</p>
                        <p className="text-xs text-gray-300">{response.timestamp}</p>
                      </div>
                    </div>
                  </div>
                ))
                )}
              </div>

              {/* Summary Insights */}
              <div className="mt-6 bg-blue-500/10 border border-blue-500/20 rounded-lg p-4">
                <h3 className="text-lg font-semibold text-blue-300 mb-2">Session Insights</h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                  <div>
                    <p className="text-gray-400">Overall Mood</p>
                    <p className="text-white font-medium">
                      {sessionAnalytics.responses.length === 0 ? "No responses yet" :
                       (() => {
                         const avgScore = sessionAnalytics.totalScore / sessionAnalytics.responses.length;
                         if (avgScore <= 1) return "Positive";
                         if (avgScore <= 2) return "Moderate";
                         return "Concerning";
                       })()}
                    </p>
                  </div>
                  <div>
                    <p className="text-gray-400">Engagement Level</p>
                    <p className="text-white font-medium">
                      {sessionAnalytics.responses.length === 0 ? "No responses yet" :
                       sessionAnalytics.responses.length >= 6 ? "High" :
                       sessionAnalytics.responses.length >= 3 ? "Moderate" : "Low"}
                    </p>
                  </div>
                  <div>
                    <p className="text-gray-400">Areas of Concern</p>
                    <p className="text-white font-medium">
                      {sessionAnalytics.criticalCount === 0 ? "None detected" :
                       sessionAnalytics.criticalCount === 1 ? "1 critical response" :
                       `${sessionAnalytics.criticalCount} critical responses`}
                    </p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      <div className="max-w-7xl mx-auto p-6">
        <div
          className={`grid gap-6 transition-all duration-700 ease-in-out ${
            isInConversation ? "grid-cols-1" : "lg:grid-cols-4"
          }`}
        >
          {/* Main Video Call Preview */}
          <div
            className={`space-y-4 transition-all duration-700 ease-in-out ${
              isInConversation ? "col-span-1" : "lg:col-span-3"
            }`}
          >
            <Card className="bg-gray-800 border-gray-700 overflow-hidden">
              <CardContent className="p-0">
                <div
                  className={`relative overflow-hidden transition-all duration-700 ease-in-out w-full ${
                    isInConversation ? "aspect-video h-[80vh]" : "aspect-video"
                  }`}
                >
                  {/* Digital Human Container - Simple div for Uneeq to populate */}
                  <div
                    id="uneeqContainedLayout"
                    className={`absolute inset-0 transition-all duration-500 ${
                      isInConversation ? 'opacity-100' : 'opacity-0 pointer-events-none'
                    }`}
                  />
                  {dimAvatarActive && (
                    <div className="absolute inset-0 bg-black/80 pointer-events-none z-40" />
                  )}

                  {/* Survey Modal Overlay */}
                  {showSurveyModal && (
                    <div className="absolute inset-0 z-50 flex items-center justify-center">
                      <div className="absolute inset-0 bg-black/80" />
                      <div className="relative bg-gray-800 border border-gray-700 rounded-xl shadow-xl w-full max-w-md mx-4 p-6">
                        <h3 className="text-xl font-semibold text-white mb-4">Quick Survey</h3>
                        <div className="space-y-4 text-gray-200">
                          <div>
                            <p className="mb-2">Did you like talking to me today?</p>
                            <div className="flex gap-6">
                              <label className="flex items-center gap-2">
                                <input type="radio" name="q1" value="Yes" className="accent-orange-500" />
                                <span>Yes</span>
                              </label>
                              <label className="flex items-center gap-2">
                                <input type="radio" name="q1" value="No" className="accent-orange-500" />
                                <span>No</span>
                              </label>
                            </div>
                          </div>
                          <div>
                            <p className="mb-2">Would you like to talk to me again next time?</p>
                            <div className="flex gap-6">
                              <label className="flex items-center gap-2">
                                <input type="radio" name="q2" value="Yes" className="accent-orange-500" />
                                <span>Yes</span>
                              </label>
                              <label className="flex items-center gap-2">
                                <input type="radio" name="q2" value="No" className="accent-orange-500" />
                                <span>No</span>
                              </label>
                            </div>
                          </div>
                        </div>
                        <div className="mt-6 flex items-center justify-end gap-3">
                          <button
                            className="px-4 py-2 rounded-md border border-gray-600 text-gray-200 hover:bg-gray-700"
                            onClick={() => {
                              sendMessage('cancelled')
                              setShowSurveyModal(false)
                            }}
                          >
                            Cancel
                          </button>
                          <button
                            className="px-4 py-2 rounded-md bg-orange-500 hover:bg-orange-600 text-white"
                            onClick={() => {
                              const q1 = (document.querySelector('input[name="q1"]:checked') as HTMLInputElement | null)?.value || 'No response'
                              const q2 = (document.querySelector('input[name="q2"]:checked') as HTMLInputElement | null)?.value || 'No response'
                              const payload = `Survey Response:\n- Did you like talking to me today?: ${q1}\n- Would you like to talk to me again next time?: ${q2}`
                              sendMessage(payload)
                              setShowSurveyModal(false)
                            }}
                          >
                            Submit
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                  
                  {/* Loading Screen - Shows while Sophie is initializing */}
                  {showLoadingScreen && (
                    <div className="absolute inset-0 bg-gray-900/95 backdrop-blur-sm flex items-center justify-center z-50">
                      <div className="text-center space-y-6">
                        {/* Animated loading spinner */}
                        <div className="relative">
                          <div className="w-20 h-20 border-4 border-orange-500/20 border-t-orange-500 rounded-full animate-spin mx-auto"></div>
                          <div className="absolute inset-0 flex items-center justify-center">
                            <div className="w-8 h-8 bg-gradient-to-r from-orange-400 to-yellow-500 rounded-full animate-pulse"></div>
                          </div>
                        </div>
                        
                        {/* Loading text */}
                                                       <div className="space-y-2">
                                 <h3 className="text-xl font-semibold text-white">Initializing Sophie</h3>
                                 <p className="text-gray-300 text-sm max-w-xs mx-auto">
                                   {scriptStatus === 'loading' ? 'Loading Uneeq SDK...' :
                                   scriptStatus === 'ready' ? 'Connecting to digital human...' :
                                   'Preparing therapeutic environment...'}
                                 </p>

                               </div>
                        
                        {/* Progress dots */}
                        <div className="flex justify-center space-x-2">
                          <div className="w-2 h-2 bg-orange-500 rounded-full animate-bounce"></div>
                          <div className="w-2 h-2 bg-orange-500 rounded-full animate-bounce" style={{animationDelay: '0.1s'}}></div>
                          <div className="w-2 h-2 bg-orange-500 rounded-full animate-bounce" style={{animationDelay: '0.2s'}}></div>
                        </div>
                      </div>
                    </div>
                  )}
                  
                  {/* Tiger Image as background - Only visible in preview mode */}
                  {!isInConversation && (
                    <img
                      src="/images/sunny-tiger.png"
                      alt="Sunny the Tiger"
                      className="absolute inset-0 w-full h-full object-cover object-center"
                    />
                  )}

                  {/* Assessment Overlay - Glassmorphism Style - Conditionally Rendered */}
                  {localShowAssessmentScale && (!isInConversation || showAssessmentScale) && (
                    <div className="absolute right-4 top-1/2 -translate-y-1/2 transition-all duration-500 z-10">
                      <div className="w-72 bg-black/20 backdrop-blur-xl border border-white/10 rounded-2xl shadow-2xl">
                        <div className="p-4 border-b border-white/10">
                          <div className="flex items-center gap-2 text-white/90">
                            <ClipboardList className="w-4 h-4 text-white/70" />
                            <span className="text-sm font-medium">Question {currentQuestionNumber} of 9</span>
                          </div>
                        </div>
                        <div className="p-4 space-y-4">
                          <p className={`text-white/90 ${showLargeText ? "text-base" : "text-sm"} leading-relaxed`}>
                            "{getQuestionText(currentQuestionNumber)}"
                          </p>

                          <div className="space-y-2">
                            {([
                              { value: 0, label: "Not at all", color: "from-green-500/80 to-green-600/80" },
                              { value: 1, label: "Several days", color: "from-yellow-500/80 to-yellow-600/80" },
                              { value: 2, label: "More than half the days", color: "from-orange-500/80 to-orange-600/80" },
                              { value: 3, label: "Nearly every day", color: "from-red-500/80 to-red-600/80" },
                              { value: "skip" as const, label: "Skip", color: "from-gray-500/80 to-gray-600/80" },
                            ] as const).map((option, i) => (
                              <button
                                key={i}
                                onClick={() => handleAssessmentResponse(option.value)}
                                className={`w-full text-left p-2 bg-gradient-to-r ${option.color} backdrop-blur-sm border border-white/20 rounded-xl text-white ${showLargeText ? "text-base" : "text-sm"} transition-all hover:scale-[1.02] hover:border-white/30 hover:shadow-lg`}
                              >
                                <div className="flex items-center gap-2">
                                  <div className="w-5 h-5 bg-white/30 backdrop-blur-sm rounded-full flex items-center justify-center text-xs font-bold border border-white/20">
                                    {option.value === "skip" ? "-" : option.value}
                                  </div>
                                  <span>{option.label}</span>
                                </div>
                              </button>
                            ))}
                          </div>

                          <div className="flex justify-center items-center pt-2 border-t border-white/10">
                            <div className="flex gap-1">
                              {[...Array(9)].map((_, i) => (
                                <div
                                  key={i}
                                  className={`w-1.5 h-1.5 rounded-full ${i < 3 ? "bg-white/60" : "bg-white/20"}`}
                                />
                              ))}
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Video call UI elements */}
                  <div className="absolute top-4 left-4 z-10">
                    <div className="flex items-center gap-2 bg-black/40 backdrop-blur-sm rounded-full px-3 py-2">
                      <div
                        className={`w-2 h-2 rounded-full animate-pulse ${
                          isInConversation ? "bg-green-400" : "bg-yellow-400"
                        }`}
                      />
                      <span className="text-sm text-white font-medium">
                        {isInConversation ? "Connected" : "Preview"}
                      </span>
                    </div>
                  </div>

                  {/* Closed Captions Preview - Uneeq Style (Only before session) */}
                  {showClosedCaptions && !isInConversation && (
                    <div className={`absolute bottom-4 z-10 ${
                      localShowAssessmentScale ? 'left-4' : 'right-4'
                    }`}>
                      <div className="bg-gray-200/20 backdrop-blur-sm rounded-sm px-3 py-2 max-w-md">
                        <p className="text-white text-sm leading-relaxed">
                          Hi there! I'm Sunny, and I'm here to chat with you today.
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Start/End Conversation Button */}
            {!isInConversation && (
              <div className="flex justify-center animate-in fade-in slide-in-from-bottom-4 duration-500">
                <Button
                  size="lg"
                  onClick={handleStartConversation}
                  className={`${showLargeText ? "text-lg py-3" : "text-base py-2"} w-52 bg-gradient-to-r from-orange-400 to-yellow-500 hover:from-orange-500 hover:to-yellow-600 text-white font-normal border-0 shadow-lg hover:shadow-xl transition-all duration-200`}
                >
                  <span className="flex items-center gap-1">
                    Begin Session
                    <Play className="w-4 h-4 fill-white" />
                  </span>
                </Button>
              </div>
            )}
          </div>

          {/* Settings Sidebar - Slides out during conversation */}
          <div
            className={`space-y-3 transition-all duration-700 ease-in-out ${
              isInConversation
                ? "opacity-0 translate-x-full pointer-events-none absolute right-0 top-0"
                : "opacity-100 translate-x-0"
            }`}
          >
            {/* Character Selection */}
            <Card className="bg-gray-800 border-gray-700">
              <CardHeader className="pb-1">
                <CardTitle
                  className={`${showLargeText ? "text-base" : "text-sm"} font-medium flex items-center gap-2 text-white`}
                >
                  <Sparkles className="w-4 h-4 text-orange-400" />
                  Character
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { name: "Mei", active: true, personaId: "62e50c7d-0f01-44b2-80ce-1467a665ec31", thumbnail: "https://cdn.uneeq.io/admin/assets/img/preview/Dell_Mei_01.png" },
                    { name: "Ethan", active: false, personaId: "f19a9fbc-eef6-4d15-8887-34c2a5ee3449", thumbnail: "https://cdn.uneeq.io/admin/assets/img/preview/Dell_Ethan_01.png" },
                    { name: "Sara", active: false, personaId: "d1d6ef17-a319-4bd9-88bc-8d1c7214764e", thumbnail: "https://cdn.uneeq.io/admin/assets/img/preview/Dell_Sara_01.png" },
                    { name: "Tomas", active: false, personaId: "90a9c3ab-e0db-4ee8-b159-9d264e0f3dab", thumbnail: "https://cdn.uneeq.io/admin/assets/img/preview/Dell_Thomas_01.png" },
                    
                  ].map((char, i) => (
                    <div
                      key={i}
                      className={`aspect-square rounded-xl border-2 flex flex-col items-center justify-center cursor-pointer transition-all ${
                        char.active
                          ? "border-orange-400 bg-gradient-to-br from-orange-400/20 to-yellow-400/20 shadow-lg"
                          : "border-gray-600 hover:border-gray-500 hover:bg-gray-700/50"
                      }`}
                    >
                      
                      <span className={`${showLargeText ? "text-base" : "text-sm"} text-gray-200 font-medium`}>
                        {char.name}
                      </span>
                      
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Settings */}
            <Card className="bg-gray-800 border-gray-700">
              <CardHeader className="pb-1">
                <CardTitle
                  className={`${showLargeText ? "text-base" : "text-sm"} font-medium flex items-center gap-2 text-white`}
                >
                  <User className="w-4 h-4 text-green-400" />
                  Accessibility
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label className={`${showLargeText ? "text-base" : "text-sm"} text-gray-300 font-normal`}>
                    Closed Captions
                  </Label>
                  <Switch
                    checked={showClosedCaptions}
                    onCheckedChange={setShowClosedCaptions}
                    className="data-[state=checked]:bg-orange-500 data-[state=unchecked]:bg-gray-600"
                  />
                </div>
                <div className="flex items-center justify-between">
                  <Label className={`${showLargeText ? "text-base" : "text-sm"} text-gray-300 font-normal`}>
                    Large Text Mode
                  </Label>
                  <Switch
                    checked={showLargeText}
                    onCheckedChange={setShowLargeText}
                    className="data-[state=checked]:bg-orange-500 data-[state=unchecked]:bg-gray-600"
                  />
                </div>
                <div className="flex items-center justify-between">
                  <Label className={`${showLargeText ? "text-base" : "text-sm"} text-gray-300 font-normal`}>
                    Assessment Scale
                  </Label>
                  <Switch
                    checked={localShowAssessmentScale}
                    onCheckedChange={setLocalShowAssessmentScale}
                    className="data-[state=checked]:bg-orange-500 data-[state=unchecked]:bg-gray-600"
                  />
                </div>
              </CardContent>
            </Card>

            {/* Voice Settings - Commented Out */}
            {/* <Card className="bg-gray-800 border-gray-700">
              <CardHeader className="pb-1">
                <CardTitle
                  className={`${showLargeText ? "text-base" : "text-sm"} font-medium flex items-center gap-2 text-white`}
                >
                  <Headphones className="w-4 h-4 text-blue-400" />
                  Voice & Tone
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label className={`${showLargeText ? "text-base" : "text-sm"} text-gray-300 mb-2 block font-normal`}>
                    Therapeutic Approach
                  </Label>
                  <div className="grid grid-cols-2 gap-2">
                    <Button
                      size="sm"
                      className={`${showLargeText ? "text-base" : "text-sm"} bg-gradient-to-r from-orange-400 to-yellow-500 hover:from-orange-500 hover:to-yellow-600 text-white`}
                    >
                      Gentle
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className={`${showLargeText ? "text-base" : "text-sm"} border-gray-600 hover:bg-gray-700 text-white bg-transparent`}
                    >
                      Encouraging
                    </Button>
                  </div>
                </div>
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <Label className={`${showLargeText ? "text-base" : "text-sm"} text-gray-300 font-normal`}>
                      Volume
                    </Label>
                    <span className={`${showLargeText ? "text-base" : "text-sm"} text-gray-300`}>{volume[0]}%</span>
                  </div>
                  <Slider
                    value={volume}
                    onValueChange={setVolume}
                    max={100}
                    step={1}
                    className="w-full [&_[role=slider]]:bg-white [&_[role=slider]]:border-gray-300 [&_.bg-primary]:bg-orange-500"
                  />
                </div>
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <Label className={`${showLargeText ? "text-base" : "text-sm"} text-gray-300 font-normal`}>
                      Pitch
                    </Label>
                    <span className={`${showLargeText ? "text-base" : "text-sm"} text-gray-300`}>{pitch[0]}%</span>
                  </div>
                  <Slider
                    value={pitch}
                    onValueChange={setPitch}
                    max={100}
                    step={1}
                    className="w-full [&_[role=slider]]:bg-white [&_[role=slider]]:border-gray-300 [&_.bg-primary]:bg-orange-500"
                  />
                </div>
              </CardContent>
            </Card> */}
          </div>
        </div>
      </div>
    </div>
  )
}
