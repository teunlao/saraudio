import AudioToolbox
import CoreAudio
import Darwin
import Dispatch
import Foundation

private enum TCCAccessPreflightResult: Int32 {
  case denied = 0
  case granted = 1
  case unknown = 2
}

private typealias TCCPreflightFuncType = @convention(c) (CFString, CFDictionary?) -> Int32
private typealias TCCRequestFuncType =
  @convention(c) (CFString, CFDictionary?, @escaping @convention(block) (Bool) -> Void) -> Void

private enum TCC {
  private static let dylibPath = "/System/Library/PrivateFrameworks/TCC.framework/TCC"

  static func accessPreflight(_ service: CFString) -> TCCAccessPreflightResult? {
    guard let handle = dlopen(dylibPath, RTLD_NOW) else { return nil }
    defer { dlclose(handle) }

    guard let sym = dlsym(handle, "TCCAccessPreflight") else { return nil }
    let fn = unsafeBitCast(sym, to: TCCPreflightFuncType.self)
    return TCCAccessPreflightResult(rawValue: fn(service, nil))
  }

  static func accessRequest(_ service: CFString, completion: @escaping (Bool) -> Void) -> Bool {
    guard let handle = dlopen(dylibPath, RTLD_NOW) else { return false }
    defer { dlclose(handle) }

    guard let sym = dlsym(handle, "TCCAccessRequest") else { return false }
    let fn = unsafeBitCast(sym, to: TCCRequestFuncType.self)
    fn(service, nil, completion)
    return true
  }
}

enum SystemAudioPreflightPermission: String, Codable {
  case granted
  case unknown
  case notPermitted = "not_permitted"
  case failed
}

struct SystemAudioPreflightReport: Codable {
  let ok: Bool
  let permission: SystemAudioPreflightPermission
  let osStatus: Int32?
  let message: String?
}

enum SystemAudioPreflight {
  static func run() -> SystemAudioPreflightReport {
    let tccService = "kTCCServiceAudioCapture" as CFString
    let preflight = TCC.accessPreflight(tccService)
    switch preflight {
    case .some(.granted):
      break
    case .some(.unknown):
      // Best-effort: attempt to prompt via private TCC API.
      let semaphore = DispatchSemaphore(value: 0)
      var granted = false
      let requestStarted = TCC.accessRequest(tccService) { ok in
        granted = ok
        semaphore.signal()
      }

      if requestStarted {
        _ = semaphore.wait(timeout: .now() + 60)
        if granted {
          break
        }
      }

      return SystemAudioPreflightReport(
        ok: false,
        permission: .unknown,
        osStatus: nil,
        message:
          "System Audio Recording permission has not been granted yet. If no system prompt appears, enable it manually in System Settings → Privacy & Security → Screen & System Audio Recording."
      )
    case .some(.denied):
      return SystemAudioPreflightReport(
        ok: false,
        permission: .notPermitted,
        osStatus: nil,
        message:
          "System Audio Recording permission is denied. Enable it in System Settings → Privacy & Security → Screen & System Audio Recording."
      )
    case .none:
      return SystemAudioPreflightReport(
        ok: false,
        permission: .failed,
        osStatus: nil,
        message: "Failed to load TCC for permission preflight."
      )
    }

    let description = CATapDescription()
    description.name = "audiotee-preflight-tap"
    description.processes = []
    description.isPrivate = true
    description.muteBehavior = .unmuted
    description.isMixdown = true
    description.isMono = true
    description.isExclusive = true
    description.deviceUID = nil  // system default
    description.stream = 0  // first stream of output device

    var tapID = AudioObjectID(kAudioObjectUnknown)
    let status = AudioHardwareCreateProcessTap(description, &tapID)

    if status == kAudioHardwareNoError {
      AudioHardwareDestroyProcessTap(tapID)
      return SystemAudioPreflightReport(
        ok: true,
        permission: .granted,
        osStatus: nil,
        message: nil
      )
    }

    return SystemAudioPreflightReport(
      ok: false,
      permission: .failed,
      osStatus: status,
      message: "Failed to create system audio process tap."
    )
  }
}
