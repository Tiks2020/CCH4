'use client';

import { useCallback, useEffect, useState } from 'react';
import { useScript } from 'usehooks-ts';

declare global {
  interface Window {
    uneeq: any;
  }
}
declare class Uneeq {
  constructor(options: any);
  init(): void;
  startSession(): void;
  endSession(): void;
  stopSpeaking(): void;
  chatPrompt(message: string): void;
  updateConfig?(config: any): void;
  setShowClosedCaptions?(show: boolean): void;
}

// TODO: Move script source to config or env variable
const scriptSrc = 'https://cdn.uneeq.io/hosted-experience/deploy/index.js';
let uneeqScriptStatus = 'idle';

export const useUneeq = (configOverride?: Partial<any>, showClosedCaptions?: boolean, localShowAssessmentScale?: boolean, showLargeText?: boolean, selectedPersonaId?: string) => {
  const [readyToStart, setReadyToStart] = useState(false);
  const [avatarLive, setAvatarLive] = useState(false);
  const [avatarThinking, setAvatarThinking] = useState(false);
  const [lastResponse, setLastResponse] = useState<string>();
  const [uneeqInstance, setUneeqInstance] = useState<Uneeq | null>(null);
  const [internalShowAssessmentScale, setInternalShowAssessmentScale] = useState(false);
  const [currentQuestionNumber, setCurrentQuestionNumber] = useState<number>(1);
  const [isReinitializing, setIsReinitializing] = useState(false); // New state for re-initialization
  const [proactiveTimeoutId, setProactiveTimeoutId] = useState<NodeJS.Timeout | null>(null);
  // Overlay control when ending via SpeechEvent
  const [dimAvatarActive, setDimAvatarActive] = useState(false);
  const [showSurveyModal, setShowSurveyModal] = useState(false);
  // Report data from Uneeq
  const [uneeqReportData, setUneeqReportData] = useState<{
    questions: Array<{
      question: number;
      score: number;
      flagged: boolean;
    }>;
    total: number;
  } | null>(null);
  const [isRequestingReport, setIsRequestingReport] = useState(false);

  uneeqScriptStatus = useScript(scriptSrc, {
    id: 'uneeq',
    shouldPreventLoad: uneeqScriptStatus === 'ready',
  });

  // Calculate captions position based on toggle states
  const getCaptionsPosition = useCallback(() => {
    const position = showClosedCaptions && localShowAssessmentScale 
      ? 'bottom-left'   // Both toggles ON = bottom-left
      : showClosedCaptions 
        ? 'bottom-right' // Only closed captions ON = bottom-right
        : 'bottom-left'; // Default fallback
    
    // Debug logging for position calculation
    console.log('🎯 DEBUG: getCaptionsPosition() called:', {
      showClosedCaptions,
      localShowAssessmentScale,
      calculatedPosition: position,
      timestamp: new Date().toISOString()
    });
    
    return position;
  }, [showClosedCaptions]);

  // Direct SDK call for closed captions - bypasses React effects
  const toggleClosedCaptionsDirect = useCallback((show: boolean) => {
    if (uneeqInstance && avatarLive) {
      try {
        // Try the direct SDK method first
        if (typeof uneeqInstance.setShowClosedCaptions === 'function') {
          uneeqInstance.setShowClosedCaptions(show);
          console.log('✅ Direct SDK call: setShowClosedCaptions(', show, ')');
          return true; // Success
        } else {
          console.log('❌ setShowClosedCaptions method not available on uneeqInstance');
          return false; // Failed
        }
      } catch (error) {
        console.log('❌ Direct SDK call failed:', error);
        return false; // Failed
      }
    }
    return false; // No instance or not live
  }, [uneeqInstance, avatarLive]);

  // Direct SDK call for large text mode - bypasses React effects
  const toggleLargeTextDirect = useCallback((show: boolean) => {
    if (uneeqInstance && avatarLive) {
      try {
        if (typeof uneeqInstance.updateConfig === 'function') {
          const customStyles = show
            ? 'h1 { font-size: 150%; } .uneeq-closed-captions { font-size: 120%; }'
            : '';
          uneeqInstance.updateConfig({ customStyles });
          console.log('✅ Direct SDK call: updateConfig({ customStyles })', customStyles);
          return true; // Success
        } else {
          console.log('❌ updateConfig method not available on uneeqInstance');
          return false; // Failed
        }
      } catch (error) {
        console.log('❌ Direct SDK call failed:', error);
        return false; // Failed
      }
    }
    return false; // No instance or not live
  }, [uneeqInstance, avatarLive]);

  // Function to update closed captions setting using direct SDK method
  const updateClosedCaptions = useCallback((show: boolean) => {
    if (uneeqInstance) {
      try {
        // Try the direct SDK method first
        if (typeof uneeqInstance.setShowClosedCaptions === 'function') {
          uneeqInstance.setShowClosedCaptions(show);
          console.log('✅ Updated closed captions using setShowClosedCaptions:', show);
        } else if (typeof uneeqInstance.updateConfig === 'function') {
          // Fallback to updateConfig if setShowClosedCaptions is not available
          const newPosition = getCaptionsPosition();
          uneeqInstance.updateConfig({ 
            showClosedCaptions: show,
            captionsPosition: newPosition
          });
          console.log('⚠️ Updated closed captions using updateConfig fallback:', show, 'Position:', newPosition);
        } else {
          console.log('❌ No closed captions method available on uneeqInstance');
        }
      } catch (error) {
        console.log('❌ Could not update closed captions dynamically:', error);
      }
    }
  }, [uneeqInstance, getCaptionsPosition]);

  // Update closed captions when the prop changes - only during initialization, not during active sessions
  useEffect(() => {
    console.log('🔍 Closed captions useEffect triggered:', { showClosedCaptions, avatarLive });
    if (showClosedCaptions !== undefined && !avatarLive) {
      console.log('🔍 Updating closed captions during initialization');
      updateClosedCaptions(showClosedCaptions);
    } else if (avatarLive) {
      console.log('🔍 Skipping closed captions update - session is active');
    }
  }, [showClosedCaptions, updateClosedCaptions, avatarLive]);

  // Update position when assessment scale changes
  useEffect(() => {
    if (showClosedCaptions && uneeqInstance && typeof uneeqInstance.updateConfig === 'function') {
      try {
        const newPosition = getCaptionsPosition();
        uneeqInstance.updateConfig({ captionsPosition: newPosition });
        console.log('Updated captions position to:', newPosition);
      } catch (error) {
        console.log('Could not update position dynamically');
      }
    }
  }, [localShowAssessmentScale, showClosedCaptions, uneeqInstance, getCaptionsPosition]);

  useEffect(() => {
    // 🚫 RACE CONDITION PREVENTION: Don't initialize if re-initialization is in progress
    if (isReinitializing) {
      console.log('🚫 Initialization blocked: Re-initialization in progress');
      return;
    }
    
    if (uneeqScriptStatus === 'ready' && typeof Uneeq !== 'undefined') {
      // Wait for the container to exist with retry
      const checkContainer = () => {
        const container = document.getElementById('uneeqContainedLayout');
        if (!container) {
          console.log('Container not found, retrying in 100ms...');
          setTimeout(checkContainer, 100);
          return;
        }
        
        console.log('Container found, initializing Uneeq...');
        
        // 🧹 TARGETED CACHE CLEARING: Clear Uneeq-specific storage before initialization
        // This ensures each session starts with a clean configuration as if hard-refreshed
        try {
          // Clear any Uneeq-specific localStorage keys that might contain cached preferences
          const uneeqKeys = Object.keys(localStorage).filter(key => 
            key.toLowerCase().includes('uneeq') || 
            key.toLowerCase().includes('captions') ||
            key.toLowerCase().includes('position')
          );
          
          if (uneeqKeys.length > 0) {
            console.log('🧹 DEBUG: Clearing Uneeq cache keys:', uneeqKeys);
            uneeqKeys.forEach(key => {
              localStorage.removeItem(key);
              console.log(`🧹 Cleared: ${key}`);
            });
          } else {
            console.log('🧹 DEBUG: No Uneeq cache keys found to clear');
          }
          
          // Also clear sessionStorage for good measure
          const uneeqSessionKeys = Object.keys(sessionStorage).filter(key => 
            key.toLowerCase().includes('uneeq') || 
            key.toLowerCase().includes('captions') ||
            key.toLowerCase().includes('position')
          );
          
          if (uneeqSessionKeys.length > 0) {
            console.log('🧹 DEBUG: Clearing Uneeq session cache keys:', uneeqSessionKeys);
            uneeqSessionKeys.forEach(key => {
              sessionStorage.removeItem(key);
              console.log(`🧹 Cleared: ${key}`);
            });
          }
          
          console.log('🧹 DEBUG: Cache clearing completed at:', new Date().toISOString());
        } catch (error) {
          console.warn('🧹 WARNING: Error during cache clearing:', error);
        }
        
        // TODO: Move default options to config or env variables
        const defaultOptions = {
          connectionUrl: 'https://api.uneeq.io',
          personaId: selectedPersonaId || '62e50c7d-0f01-44b2-80ce-1467a665ec31',
          displayCallToAction: false,
          renderContent: true,
          welcomePrompt: 'start',
          mobileViewWidthBreakpoint: 900,
          layoutMode: 'contained',
          cameraAnchorHorizontal: 'center',
          cameraAnchorDistance: 'loose_close_up',
          logLevel: "error", // Changed from "info" to reduce noise
          enableMicrophone: false, // Disabled to avoid recording errors
          showUserInputInterface: true,
          enableVad: false, // Enabled for voice activity detection
          enableInterruptBySpeech: true,
          autoStart: false,
          containedAutoLayout: false,
          showClosedCaptions: showClosedCaptions || false,
          captionsPosition: getCaptionsPosition(),
          customStyles: (showLargeText && showClosedCaptions ? `  
          /* Target Uneeq's actual closed captions classes from DOM inspection */
            .bubble,
            [class*="bubble"],
            [class*="ng-c"],
            [class*="ngcontent"],
            [class*="nghost"] {
              font-size: 18px !important;
              line-height: 1.4 !important;
              font-weight: 500 !important;
            }
            
            /* Target the specific bubble class we found */
            .bubble[_ngcontent-ng-c3308728835] {
              font-size: 18px !important;
              line-height: 1.4 !important;
              font-weight: 500 !important;
            }
          ` : '') + ` #unmuteBtn { transform: scale(1.5); transform-origin: center;} #muteBtn { transform: scale(1.5); transform-origin: center;} #micInitialBtn { transform: scale(1.5); transform-origin: center;} #micBlockedBtn { transform: scale(1.5); transform-origin: center;}`,
          languageStrings: {},
          customMetadata: { selectedPersonaId },
          speechRecognitionHintPhrasesBoost: 0,
          allowResumeSession: false,
          forceTURN: false,
        };

        const uneeqOptions = {
          ...defaultOptions
        };
        
        // Debug logging for Uneeq initialization
        console.log('🚀 DEBUG: Initializing Uneeq with options:', {
          showClosedCaptions: uneeqOptions.showClosedCaptions,
          captionsPosition: uneeqOptions.captionsPosition,
          showLargeText,
          localShowAssessmentScale,
          timestamp: new Date().toISOString()
        });
        
        // Additional debug: Show the exact configuration being passed to Uneeq
        console.log('🔧 DEBUG: Final Uneeq configuration details:', {
          connectionUrl: uneeqOptions.connectionUrl,
          personaId: uneeqOptions.personaId,
          showClosedCaptions: uneeqOptions.showClosedCaptions,
          captionsPosition: uneeqOptions.captionsPosition,
          customStyles: uneeqOptions.customStyles ? 'CUSTOM_STYLES_APPLIED' : 'NO_CUSTOM_STYLES',
          allowResumeSession: uneeqOptions.allowResumeSession,
          timestamp: new Date().toISOString()
        });
        
        console.log('🎨 Custom styles debug:', {
          showLargeText,
          showClosedCaptions,
          customStyles: defaultOptions.customStyles,
          willApplyStyles: showLargeText && showClosedCaptions
        });
        console.log('Initializing Uneeq with options:', uneeqOptions);
        const instance = new Uneeq(uneeqOptions);
        setUneeqInstance(instance);
        // Make instance globally available for direct SDK calls
        (window as any).uneeq = instance;
        instance.init(); // Initialize Uneeq
        setReadyToStart(true);
        console.log('Uneeq instance created and initialized.');
      };
      
      checkContainer();
    }
  }, [uneeqScriptStatus, configOverride, isReinitializing, selectedPersonaId]);

  

  // Update large text mode during active sessions using direct SDK method
  useEffect(() => {
    if (uneeqInstance && avatarLive && typeof uneeqInstance.updateConfig === 'function') {
      console.log('🔄 Large text mode changed, updating custom styles immediately:', showLargeText);
      try {
        const customStyles = showLargeText
          ? 'h1 { font-size: 150%; } .uneeq-closed-captions { font-size: 120%; }'
          : '';
        console.log('🔄 Updating custom styles:', customStyles);
        uneeqInstance.updateConfig({ customStyles });
        console.log('🔄 Custom styles updated successfully');
      } catch (error) {
        console.log('🔄 Could not update custom styles:', error);
      }
    }
  }, [showLargeText, uneeqInstance, avatarLive]);
  
  // Helper function to trigger re-initialization
  const triggerReinitialization = useCallback(() => {
    console.log('🔄 DEBUG: Triggering re-initialization...');
    
    // Set re-initialization flag to prevent race conditions
    setIsReinitializing(true);
    
    // Clean up existing instance safely
    try {
      if (typeof (uneeqInstance as any).destroy === 'function') {
        (uneeqInstance as any).destroy();
        console.log('🔄 Destroyed previous Uneeq instance');
      } else if (typeof (uneeqInstance as any).disconnect === 'function') {
        (uneeqInstance as any).disconnect();
        console.log('🔄 Disconnected previous Uneeq instance');
      } else if (typeof (uneeqInstance as any).endSession === 'function') {
        (uneeqInstance as any).endSession();
        console.log('🔄 Ended previous Uneeq session');
      }
    } catch (error) {
      console.log('🔄 Could not clean up previous instance:', error);
    }
    
    // Reset instance and trigger re-initialization
    setUneeqInstance(null);
    setAvatarLive(false);
    setReadyToStart(false);
    
    // Small delay to ensure cleanup is complete, then clear re-initialization flag
    setTimeout(() => {
      console.log('🔄 Triggering re-initialization with updated toggle states');
      setIsReinitializing(false); // Clear flag to allow new initialization
    }, 100);
  }, [uneeqInstance]);

  useEffect(() => {
    if (!uneeqInstance) return;

    const handleUneeqMessage = (event: any) => {
      const msg = event.detail;
      // console.log('Uneeq message type:', msg.uneeqMessageType, 'Full message:', msg);
      switch (msg.uneeqMessageType) {
        case 'PromptRequest':
          console.log('PromptRequest received - asserting showAssessmentScale to false');
          setInternalShowAssessmentScale(false);
          // Clear the proactive timeout since user is responding
          if (proactiveTimeoutId) {
            clearTimeout(proactiveTimeoutId);
            setProactiveTimeoutId(null);
            console.log('Proactive timeout cleared due to PromptRequest');
          }
          break;
        case 'SpeechEvent':
            // TODO: Handle SpeechEvent (Say to cursor to get get EventValue show button for example) 
            const eventValue = msg.speechEvent.param_value;
            console.log('SpeechEvent received - Full message:', msg);
            console.log('SpeechEvent value: ', eventValue);
            setLastResponse(eventValue);
            
            // Handle explicit commands from eventValue
            if (typeof eventValue === 'string') {
              switch (true) {
                case eventValue === 'showSurvey': {
                  console.log('🟢 SpeechEvent command: showSurvey');
                  setShowSurveyModal(true);
                  break;
                }
                case eventValue === 'endSession': {
                  console.log('🟠 SpeechEvent command: endSession → hiding user input interface, will dim after avatar stops speaking');
                  try {
                    if (uneeqInstance && typeof (uneeqInstance as any).setShowUserInputInterface === 'function') {
                      (uneeqInstance as any).setShowUserInputInterface(false);
                    } else {
                      console.log('setShowUserInputInterface is not available on uneeqInstance');
                    }
                    // Queue dimming once avatar finishes current speech
                    setDimAvatarActive(true);
                    console.log('🟣 Dim overlay added');
                  } catch (e) {
                    console.warn('Failed to hide user input interface from SpeechEvent', e);
                  }
                  break;
                }
                case /^question_\d+/.test(eventValue): {
                  const match = eventValue.match(/^question_(\d+)/);
                  const questionNum = match ? parseInt(match[1], 10) : NaN;
                  if (!Number.isNaN(questionNum)) {
                    console.log(`🟦 SpeechEvent command: question_ → setting question ${questionNum} and showing scale`);
                    setCurrentQuestionNumber(questionNum);
                    setInternalShowAssessmentScale(true);
                  }
                  break;
                }
                default:
                  break;
              }
            }
            
            // Check if SpeechEvent contains custom_event XML to show assessment scale
            // if (eventValue && typeof eventValue === 'string' && eventValue.includes('<uneeq:custom_event name="question_1" />')) {
            //   console.log('✅ Found custom_event XML in SpeechEvent - showing assessment scale');
            //   setInternalShowAssessmentScale(true);
            // }
            break;
            
        case 'PromptResult':
          // console.log('PromptResult received - Full message:', msg);
          // Modify this to only send the "final" response
          
          // Handle report response
          if (isRequestingReport && msg.promptResult?.response?.text) {
            const response = msg.promptResult.response;
            console.log('📊 Received report response:', response.text);
            console.log('📊 Response final status:', response.final);
            
            // Only parse JSON if this is the final response
            if (response.final === true) {
              try {
                const reportText = response.text;
                console.log('📊 Parsing final report response:', reportText);
                
                // Parse JSON response
                const reportData = JSON.parse(reportText);
                console.log('📊 Parsed report data:', reportData);
                
                setUneeqReportData(reportData);
                setIsRequestingReport(false);
              } catch (e) {
                console.warn('Failed to parse report JSON:', e);
                setIsRequestingReport(false);
              }
            } else {
              console.log('📊 Waiting for final response, current response is not final');
            }
          }
          
          
            break;

        case 'AvatarStoppedSpeaking':
          console.log('AvatarStoppedSpeaking');
          // Clear any existing timeout
          if (proactiveTimeoutId) {
            clearTimeout(proactiveTimeoutId);
            setProactiveTimeoutId(null);
          }
          // Start 30-second timeout
          const timeoutId = setTimeout(() => {
            proactivePromptOnTimeout();
            setProactiveTimeoutId(null);
          }, 30000);
          setProactiveTimeoutId(timeoutId);
          break;
        case 'SpeechTranscription':
          console.log('SpeechTranscription event handler firing')
          if(msg.speechTranscription.transcript === '') {
            console.log('Empty speech transcription detected - sending "null" string to trigger proactive repair dialog')
            uneeqInstance.chatPrompt("null")
          }
          break;
        case 'Error':
          // Handle errors more gracefully
          console.warn('Uneeq error:', msg);
          break;
          
        default:
          // Check all possible locations for the XML in any message type
          const possibleText =
            (msg && msg.promptResult && msg.promptResult.response && msg.promptResult.response.text) ||
            (msg && msg.promptResult && msg.promptResult.text) ||
            (msg && msg.speechEvent && msg.speechEvent.param_value) ||
            (msg && msg.param_value) ||
            (msg && msg.text);
            
          if (typeof possibleText === 'string' && possibleText.includes('<uneeq:displayAssesmentScale />')) {
            console.log('✅ Found displayAssesmentScale XML in message:', msg.uneeqMessageType);
            setInternalShowAssessmentScale(true);
          }
          break;
      }
    };

    window.addEventListener('UneeqMessage', handleUneeqMessage as EventListener);
    console.log('UneeqMessage listener added.');
    

    


    return () => {
      window.removeEventListener('UneeqMessage', handleUneeqMessage as EventListener);
      console.log('UneeqMessage listener removed.');
      // Clean up proactive timeout
      if (proactiveTimeoutId) {
        clearTimeout(proactiveTimeoutId);
        setProactiveTimeoutId(null);
        console.log('Proactive timeout cleared on cleanup');
      }
      // Optional: Clean up Uneeq instance if component unmounts while session active?
      // if (avatarLive) {
      //   uneeqInstance.endSession();
      // }
    };
  }, [uneeqInstance, isRequestingReport, proactiveTimeoutId]);

  const startSession = useCallback(() => {
    console.log('🔍 SESSION START - Assessment Scale State:', {
      currentQuestionNumber,
      internalShowAssessmentScale,
      timestamp: new Date().toISOString()
    });
    
    // Reset assessment scale state for new session
    setCurrentQuestionNumber(1);
    setInternalShowAssessmentScale(false);
    console.log('🔍 RESET - Assessment Scale State Reset for New Session:', {
      currentQuestionNumber: 1,
      internalShowAssessmentScale: false,
      timestamp: new Date().toISOString()
    });
    
    console.log('Attempting to start session...', { readyToStart, avatarLive, isReinitializing });
    
    // 🚫 RACE CONDITION PREVENTION: Don't start session if re-initialization is in progress
    if (isReinitializing) {
      console.log('🚫 Session start blocked: Re-initialization in progress');
      return;
    }
    
    if (uneeqInstance && readyToStart && !avatarLive) {
      console.log('Calling uneeqInstance.startSession()');
      uneeqInstance.startSession();
      setAvatarLive(true);
      
      // Test if we can send a message to trigger the digital human
      setTimeout(() => {
        console.log('Testing: Sending welcome message to trigger digital human...');
        if (uneeqInstance) {
          // uneeqInstance.chatPrompt("Hello, can you start the session?");
          
          // Debug: Check what properties are available on the uneeqInstance
          console.log('Uneeq instance properties:', Object.keys(uneeqInstance));
          console.log('Uneeq instance:', uneeqInstance);
        }
      }, 3000);
    }
  }, [uneeqInstance, readyToStart, avatarLive, currentQuestionNumber, internalShowAssessmentScale]);

  const endSession = useCallback(() => {
    console.log('🔍 SESSION END - Assessment Scale State:', {
      currentQuestionNumber,
      internalShowAssessmentScale,
      timestamp: new Date().toISOString()
    });
    
    // Reset assessment scale state when ending session
    setCurrentQuestionNumber(1);
    setInternalShowAssessmentScale(false);
    setDimAvatarActive(false);
    console.log('🔍 RESET - Assessment Scale State Reset on Session End:', {
      currentQuestionNumber: 1,
      internalShowAssessmentScale: false,
      timestamp: new Date().toISOString()
    });
    
    console.log('Attempting to end session...', { avatarLive });
    // Clear proactive timeout when ending session
    if (proactiveTimeoutId) {
      clearTimeout(proactiveTimeoutId);
      setProactiveTimeoutId(null);
      console.log('Proactive timeout cleared on session end');
    }
    if (uneeqInstance && avatarLive) {
      console.log('Calling uneeqInstance.endSession()');
      uneeqInstance.endSession();
      setAvatarLive(false);
    }
  }, [uneeqInstance, avatarLive, currentQuestionNumber, internalShowAssessmentScale, proactiveTimeoutId]);

  const stopSpeaking = useCallback(() => {
    if (uneeqInstance) {
      uneeqInstance.stopSpeaking();
    }
  }, [uneeqInstance]);

  const proactivePromptOnTimeout = useCallback(() => {
    console.log('Proactive timeout triggered - sending "timeout" prompt');
    if (uneeqInstance) {
      uneeqInstance.chatPrompt('timeout');
    }
  }, [uneeqInstance, avatarLive]);

  const sendMessage = useCallback(
    (message: string) => {
      console.log('Attempting to send message...', { avatarLive });
      if (uneeqInstance && avatarLive) {
        console.log(`Calling uneeqInstance.chatPrompt('${message}')`);
        uneeqInstance.chatPrompt(message);
        
        // Hide assessment scale when user sends any input
        setInternalShowAssessmentScale(false);
      }
    },
    [uneeqInstance, avatarLive, setInternalShowAssessmentScale]
  );

  const requestReport = useCallback(() => {
    if (uneeqInstance && avatarLive) {
      console.log('📊 Requesting report from Uneeq...');
      setIsRequestingReport(true);
      try {
        (uneeqInstance as any).muteDigitalHuman();
        uneeqInstance.chatPrompt("getReport");
      } catch (e) {
        console.warn('Failed to request report:', e);
        setIsRequestingReport(false);
      }
    }
  }, [uneeqInstance, avatarLive]);

  return {
    scriptStatus: uneeqScriptStatus,
    readyToStart,
    avatarLive,
    avatarThinking,
    lastResponse,
    showAssessmentScale: internalShowAssessmentScale,
    setShowAssessmentScale: setInternalShowAssessmentScale,
    currentQuestionNumber,
    startSession, // Renamed from startDigitalHuman for clarity
    endSession,
    stopSpeaking,
    sendMessage,
    uneeqInstance,
    dimAvatarActive,
    showSurveyModal,
    setShowSurveyModal,
    uneeqReportData,
    isRequestingReport,
    requestReport,
    // Direct SDK call functions for immediate updates without re-initialization
    toggleClosedCaptionsDirect,
    toggleLargeTextDirect,
  };
}; 