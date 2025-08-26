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
}

// TODO: Move script source to config or env variable
const scriptSrc = 'https://cdn.uneeq.io/hosted-experience/deploy/index.js';
let uneeqScriptStatus = 'idle';

export const useUneeq = (configOverride?: Partial<any>, showClosedCaptions?: boolean, localShowAssessmentScale?: boolean, showLargeText?: boolean) => {
  const [readyToStart, setReadyToStart] = useState(false);
  const [avatarLive, setAvatarLive] = useState(false);
  const [avatarThinking, setAvatarThinking] = useState(false);
  const [lastResponse, setLastResponse] = useState<string>();
  const [uneeqInstance, setUneeqInstance] = useState<Uneeq | null>(null);
  const [internalShowAssessmentScale, setInternalShowAssessmentScale] = useState(false);
  const [currentQuestionNumber, setCurrentQuestionNumber] = useState<number>(1);
  const [isReinitializing, setIsReinitializing] = useState(false); // New state for re-initialization
  // Overlay control when ending via SpeechEvent
  const [dimAvatarActive, setDimAvatarActive] = useState(false);
  const [showSurveyModal, setShowSurveyModal] = useState(false);

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
  }, [showClosedCaptions, localShowAssessmentScale]);

  // Function to update closed captions setting
  const updateClosedCaptions = useCallback((show: boolean) => {
    if (uneeqInstance && typeof uneeqInstance.updateConfig === 'function') {
      try {
        const newPosition = getCaptionsPosition();
        uneeqInstance.updateConfig({ 
          showClosedCaptions: show,
          captionsPosition: newPosition
        });
        console.log('Updated closed captions setting:', show, 'Position:', newPosition);
      } catch (error) {
        console.log('Could not update closed captions dynamically, will reinitialize on next session');
      }
    }
  }, [uneeqInstance, getCaptionsPosition]);

  // Update closed captions when the prop changes
  useEffect(() => {
    if (showClosedCaptions !== undefined) {
      updateClosedCaptions(showClosedCaptions);
    }
  }, [showClosedCaptions, updateClosedCaptions]);

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
          personaId: '90a9c3ab-e0db-4ee8-b159-9d264e0f3dab',
          displayCallToAction: false,
          renderContent: true,
          mobileViewWidthBreakpoint: 900,
          layoutMode: 'contained',
          cameraAnchorHorizontal: 'center',
          cameraAnchorDistance: 'loose_close_up',
          logLevel: "warn", // Changed from "info" to reduce noise
          enableMicrophone: false, // Disabled to avoid recording errors
          showUserInputInterface: true,
          enableVad: true, // Enabled for voice activity detection
          enableInterruptBySpeech: false,
          autoStart: false,
          containedAutoLayout: true,
          showClosedCaptions: showClosedCaptions || false,
          captionsPosition: getCaptionsPosition(),
          customStyles: showLargeText && showClosedCaptions ? `
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
          ` : '',
          languageStrings: {},
          customMetadata: {},
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
        instance.init(); // Initialize Uneeq
        setReadyToStart(true);
        console.log('Uneeq instance created and initialized.');
      };
      
      checkContainer();
    }
  }, [uneeqScriptStatus, configOverride, showClosedCaptions, showLargeText, isReinitializing]);

  // 🔄 REACTIVE CONFIGURATION UPDATE: Update Uneeq configuration when toggle states change
  // This ensures captionsPosition is updated without re-initialization
  useEffect(() => {
    // Only update if Uneeq is already initialized and stable
    if (uneeqInstance && uneeqScriptStatus === 'ready') {
      console.log('🔄 DEBUG: Toggle states changed, checking if configuration update is possible...');
      console.log('🔄 DEBUG: uneeqInstance type:', typeof uneeqInstance);
      console.log('🔄 DEBUG: uneeqInstance methods:', Object.getOwnPropertyNames(uneeqInstance));
      console.log('🔄 DEBUG: updateConfig method exists:', typeof uneeqInstance.updateConfig === 'function');
      
      if (typeof uneeqInstance.updateConfig === 'function') {
        console.log('🔄 DEBUG: Toggle states changed, updating Uneeq configuration for correct captionsPosition');
        
        try {
          const newPosition = getCaptionsPosition();
          const newConfig = {
            showClosedCaptions: showClosedCaptions || false,
            captionsPosition: newPosition
          };
          
          console.log('🔄 Updating Uneeq config:', newConfig);
          uneeqInstance.updateConfig(newConfig);
          console.log('🔄 Uneeq configuration updated successfully');
          
        } catch (error) {
          console.log('🔄 Could not update Uneeq configuration:', error);
          console.log('🔄 Falling back to re-initialization approach');
          triggerReinitialization();
        }
      } else {
        console.log('🔄 DEBUG: updateConfig method not available, falling back to re-initialization');
        triggerReinitialization();
      }
    }
  }, [localShowAssessmentScale, showClosedCaptions]); // Only watch toggle states
  
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
      console.log('Uneeq message type:', msg.uneeqMessageType, 'Full message:', msg);
      switch (msg.uneeqMessageType) {
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
            console.log('PromptResult received - Full message:', msg);
            // Log the actual text content to see if XML is there
            /** 
            if (msg.promptResult && msg.promptResult.response && msg.promptResult.response.text) {
              console.log('PromptResult text:', msg.promptResult.response.text);
              // Check for XML in the response text
              if (msg.promptResult.response.text.includes('<uneeq:displayAssesmentScale />')) {
                console.log('✅ Found displayAssesmentScale XML in PromptResult response');
                setInternalShowAssessmentScale(true);
              }
              // Check for custom_event XML in the response text
              if (msg.promptResult.response.text.includes('<uneeq:custom_event name="question_')) {
                // Extract question number from XML like <uneeq:custom_event name="question_9" />
                const match = msg.promptResult.response.text.match(/<uneeq:custom_event name="question_(\d+)" \/>/);
                if (match) {
                  const questionNum = parseInt(match[1]);
                  console.log(`✅ Found custom_event XML for question ${questionNum} in PromptResult response - showing assessment scale`);
                  console.log('🔍 QUESTION NUMBER CHANGE - BEFORE:', {
                    oldQuestionNumber: currentQuestionNumber,
                    newQuestionNumber: questionNum,
                    timestamp: new Date().toISOString()
                  });
                  setCurrentQuestionNumber(questionNum);
                  setInternalShowAssessmentScale(true);
                  console.log('🔍 QUESTION NUMBER CHANGE - AFTER setState calls:', {
                    questionNumber: questionNum,
                    showAssessmentScale: true,
                    timestamp: new Date().toISOString()
                  });
                }
              }
            }
            if (msg.promptResult && msg.promptResult.text) {
              console.log('PromptResult direct text:', msg.promptResult.text);
              // Check for XML in the direct text
              if (msg.promptResult.text.includes('<uneeq:displayAssesmentScale />')) {
                console.log('✅ Found displayAssesmentScale XML in PromptResult direct text');
                setInternalShowAssessmentScale(true);
              }
              // Check for custom_event XML in the direct text
              if (msg.promptResult.text.includes('<uneeq:custom_event name="question_')) {
                // Extract question number from XML like <uneeq:custom_event name="question_9" />
                const match = msg.promptResult.text.match(/<uneeq:custom_event name="question_(\d+)" \/>/);
                if (match) {
                  const questionNum = parseInt(match[1]);
                  console.log(`✅ Found custom_event XML for question ${questionNum} in PromptResult direct text - showing assessment scale`);
                  console.log('🔍 QUESTION NUMBER CHANGE (DIRECT TEXT) - BEFORE:', {
                    oldQuestionNumber: currentQuestionNumber,
                    newQuestionNumber: questionNum,
                    timestamp: new Date().toISOString()
                  });
                  setCurrentQuestionNumber(questionNum);
                  setInternalShowAssessmentScale(true);
                  console.log('🔍 QUESTION NUMBER CHANGE (DIRECT TEXT) - AFTER setState calls:', {
                    questionNumber: questionNum,
                    showAssessmentScale: true,
                    timestamp: new Date().toISOString()
                  });
                }
              }
            }
              */
            break;

        case 'AvatarStoppedSpeaking':
          console.log('AvatarStoppedSpeaking');
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
      // Optional: Clean up Uneeq instance if component unmounts while session active?
      // if (avatarLive) {
      //   uneeqInstance.endSession();
      // }
    };
  }, [uneeqInstance]);

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
          uneeqInstance.chatPrompt("Hello, can you start the session?");
          
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
    if (uneeqInstance && avatarLive) {
      console.log('Calling uneeqInstance.endSession()');
      uneeqInstance.endSession();
      setAvatarLive(false);
    }
  }, [uneeqInstance, avatarLive, currentQuestionNumber, internalShowAssessmentScale]);

  const stopSpeaking = useCallback(() => {
    if (uneeqInstance) {
      uneeqInstance.stopSpeaking();
    }
  }, [uneeqInstance]);

  const sendMessage = useCallback(
    (message: string) => {
      console.log('Attempting to send message...', { avatarLive });
      if (uneeqInstance && avatarLive) {
        console.log(`Calling uneeqInstance.chatPrompt('${message}')`);
        uneeqInstance.chatPrompt(message);
      }
    },
    [uneeqInstance, avatarLive]
  );

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
  };
}; 