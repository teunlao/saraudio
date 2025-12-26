import CoreAudio
import Foundation

enum CaptureSource: String {
  case system
  case microphone

  static func parse(_ rawValue: String) -> CaptureSource? {
    switch rawValue.lowercased() {
    case "system", "sys", "tap":
      return .system
    case "mic", "microphone", "input":
      return .microphone
    default:
      return nil
    }
  }
}

struct AudioTee {
  var source: CaptureSource = .system
  var microphoneDeviceUID: String? = nil
  var includeProcesses: [Int32] = []
  var excludeProcesses: [Int32] = []
  var mute: Bool = false
  // Fixed output format for SARAudio: pcm16le / 16000Hz / mono
  var sampleRate: Double = 16000
  var chunkDuration: Double = 0.2

  init() {}

  static func main() {
    let parser = SimpleArgumentParser(
      programName: "saraudio-capture",
      abstract: "Capture system audio or microphone and stream to stdout",
      discussion: """
        saraudio-capture captures audio and streams it as structured output.

        Process filtering:
        • include-processes: Only tap specified process IDs (empty = all processes)
        • exclude-processes: Tap all processes except specified ones
        • mute: How to handle processes being tapped

        Examples:
          saraudio-capture                              # System audio, fixed 16kHz mono PCM16, tap all processes
          saraudio-capture --source mic                 # Microphone (default input), fixed 16kHz mono PCM16
          saraudio-capture --include-processes 1234     # Only tap process 1234
          saraudio-capture --include-processes 1234 5678 9012  # Tap only these processes
          saraudio-capture --exclude-processes 1234 5678       # Tap everything except these
          saraudio-capture --mute                       # Mute processes being tapped
        """
    )

    // Configure arguments
    parser.addOption(
      name: "source", help: "Audio source: system | mic (default input)", defaultValue: "system")
    parser.addOption(
      name: "mic-device-uid",
      help: "Microphone device UID to use (only with --source mic; default = system default input)")
    parser.addFlag(
      name: "list-input-devices",
      help: "List available input devices (microphones) as JSON and exit")
    parser.addFlag(
      name: "preflight-system-audio",
      help:
        "Preflight System Audio Recording permission by attempting to create a CoreAudio process tap; outputs JSON and exits")
    parser.addArrayOption(
      name: "include-processes",
      help: "Process IDs to include (space-separated, empty = all processes)")
    parser.addArrayOption(
      name: "exclude-processes", help: "Process IDs to exclude (space-separated)")
    parser.addFlag(name: "mute", help: "Mute processes being tapped")
    parser.addOption(
      name: "chunk-duration", help: "Audio chunk duration in seconds", defaultValue: "0.2")

    // Parse arguments
    do {
      try parser.parse()

      if parser.getFlag("list-input-devices") {
        do {
          let devices = try AudioDeviceManager.listInputDevices()
          let encoder = JSONEncoder()
          encoder.outputFormatting = [.sortedKeys]
          let json = try encoder.encode(devices)
          FileHandle.standardOutput.write(json)
          FileHandle.standardOutput.write("\n".data(using: .utf8)!)
          exit(0)
        } catch {
          Logger.error(
            "Failed to list input devices", context: ["error": String(describing: error)])
          exit(1)
        }
      }

      if parser.getFlag("preflight-system-audio") {
        let report = SystemAudioPreflight.run()
        do {
          let encoder = JSONEncoder()
          encoder.outputFormatting = [.sortedKeys]
          let json = try encoder.encode(report)
          FileHandle.standardOutput.write(json)
          FileHandle.standardOutput.write("\n".data(using: .utf8)!)
          exit(report.ok ? 0 : 1)
        } catch {
          Logger.error(
            "Failed to encode preflight report", context: ["error": String(describing: error)])
          exit(1)
        }
      }

      var audioTee = AudioTee()

      // Extract values
      let rawSource = try parser.getValue("source", as: String.self)
      guard let parsedSource = CaptureSource.parse(rawSource) else {
        throw ArgumentParserError.validationFailed(
          "Invalid --source. Allowed: system | mic. Got: \(rawSource)")
      }
      audioTee.source = parsedSource
      audioTee.microphoneDeviceUID = try parser.getOptionalValue("mic-device-uid", as: String.self)
      audioTee.includeProcesses = try parser.getArrayValue("include-processes", as: Int32.self)
      audioTee.excludeProcesses = try parser.getArrayValue("exclude-processes", as: Int32.self)
      audioTee.mute = parser.getFlag("mute")
      audioTee.chunkDuration = try parser.getValue("chunk-duration", as: Double.self)

      // Validate
      try audioTee.validate()

      // Run
      try audioTee.run()

    } catch ArgumentParserError.helpRequested {
      parser.printHelp()
      exit(0)
    } catch ArgumentParserError.validationFailed(let message) {
      print("Error: \(message)", to: &standardError)
      exit(1)
    } catch let error as ArgumentParserError {
      print("Error: \(error.description)", to: &standardError)
      parser.printHelp()
      exit(1)
    } catch {
      print("Error: \(error)", to: &standardError)
      exit(1)
    }
  }

  func validate() throws {
    if !includeProcesses.isEmpty && !excludeProcesses.isEmpty {
      throw ArgumentParserError.validationFailed(
        "Cannot specify both --include-processes and --exclude-processes")
    }
    if source == .microphone {
      if !includeProcesses.isEmpty || !excludeProcesses.isEmpty {
        throw ArgumentParserError.validationFailed(
          "Process filtering flags are only supported with --source system")
      }
      if mute {
        throw ArgumentParserError.validationFailed("--mute is only supported with --source system")
      }
    } else {
      if let uid = microphoneDeviceUID, !uid.isEmpty {
        throw ArgumentParserError.validationFailed("--mic-device-uid is only supported with --source mic")
      }
    }
  }

  func run() throws {
    setupSignalHandlers()

    Logger.info("Starting capture...", context: ["source": source.rawValue])

    // Validate chunk duration
    guard chunkDuration > 0 && chunkDuration <= 5.0 else {
      Logger.error(
        "Invalid chunk duration",
        context: ["chunk_duration": String(chunkDuration), "valid_range": "0.0 < duration <= 5.0"])
      throw ExitCode.failure
    }

    var tapManager: AudioTapManager? = nil
    let deviceID: AudioObjectID
    switch source {
    case .system:
      // Convert include/exclude processes to TapConfiguration format
      let (processes, isExclusive) = convertProcessFlags()

      let tapConfig = TapConfiguration(
        processes: processes,
        muteBehavior: mute ? .muted : .unmuted,
        isExclusive: isExclusive,
        isMono: true
      )

      let audioTapManager = AudioTapManager()
      tapManager = audioTapManager
      do {
        try audioTapManager.setupAudioTap(with: tapConfig)
      } catch AudioTeeError.pidTranslationFailed(let failedPIDs) {
        Logger.error(
          "Failed to translate process IDs to audio objects",
          context: [
            "failed_pids": failedPIDs.map(String.init).joined(separator: ", "),
            "suggestion": "Check that the process IDs exist and are running",
          ])
        throw ExitCode.failure
      } catch {
        Logger.error(
          "Failed to setup audio tap", context: ["error": String(describing: error)])
        throw ExitCode.failure
      }

      guard let tappedDeviceID = audioTapManager.getDeviceID() else {
        Logger.error("Failed to get device ID from audio tap manager")
        throw ExitCode.failure
      }
      deviceID = tappedDeviceID

    case .microphone:
      if let uid = microphoneDeviceUID, !uid.isEmpty {
        do {
          deviceID = try AudioDeviceManager.getInputDeviceID(uid: uid)
        } catch {
          Logger.error(
            "Failed to resolve requested input device UID",
            context: ["uid": uid, "error": String(describing: error)])
          throw ExitCode.failure
        }
      } else {
        do {
          deviceID = try AudioDeviceManager.getDefaultInputDeviceID()
        } catch {
          Logger.error(
            "Failed to resolve default input device",
            context: ["error": String(describing: error)])
          throw ExitCode.failure
        }
      }
    }

    let outputHandler = BinaryAudioOutputHandler()
    let recorder = AudioRecorder(
      deviceID: deviceID, outputHandler: outputHandler, convertToSampleRate: sampleRate,
      chunkDuration: chunkDuration)
    withExtendedLifetime(tapManager) {
      recorder.startRecording()

      // Run until the run loop is stopped (by signal handler)
      while true {
        let result = CFRunLoopRunInMode(CFRunLoopMode.defaultMode, 0.1, false)
        if result == CFRunLoopRunResult.stopped || result == CFRunLoopRunResult.finished {
          break
        }
      }

      Logger.info("Shutting down...")
      recorder.stopRecording()
    }
  }

  private func setupSignalHandlers() {
    signal(SIGINT) { _ in
      Logger.info("Received SIGINT, initiating graceful shutdown...")
      CFRunLoopStop(CFRunLoopGetMain())
    }
    signal(SIGTERM) { _ in
      Logger.info("Received SIGTERM, initiating graceful shutdown...")
      CFRunLoopStop(CFRunLoopGetMain())
    }
  }

  private func convertProcessFlags() -> ([Int32], Bool) {
    if !includeProcesses.isEmpty {
      // Include specific processes only
      return (includeProcesses, false)
    } else if !excludeProcesses.isEmpty {
      // Exclude specific processes (tap everything except these)
      return (excludeProcesses, true)
    } else {
      // Default: tap everything
      return ([], true)
    }
  }
}

// Helper for stderr output
var standardError = FileHandle.standardError

extension FileHandle: @retroactive TextOutputStream {
  public func write(_ string: String) {
    let data = Data(string.utf8)
    self.write(data)
  }
}

// Exit code handling
enum ExitCode: Error {
  case failure
}

extension ExitCode {
  var code: Int32 {
    switch self {
    case .failure:
      return 1
    }
  }
}
