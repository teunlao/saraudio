import CoreAudio
import Foundation

public enum AudioDeviceManagerError: Error {
  case failedToResolveDefaultInputDevice(status: OSStatus)
  case failedToResolveAllDevices(status: OSStatus)
  case failedToReadDeviceProperty(selector: AudioObjectPropertySelector, status: OSStatus)
  case failedToReadInputStreamConfiguration(status: OSStatus)
  case inputDeviceUIDNotFound(uid: String)
}

public class AudioDeviceManager {
  public struct AudioInputDeviceInfo: Codable {
    public let id: UInt32
    public let uid: String
    public let name: String

    public init(id: UInt32, uid: String, name: String) {
      self.id = id
      self.uid = uid
      self.name = name
    }
  }

  public static func getDefaultInputDeviceID() throws -> AudioObjectID {
    var address = getPropertyAddress(selector: kAudioHardwarePropertyDefaultInputDevice)
    var deviceID = AudioObjectID(0)
    var size = UInt32(MemoryLayout<AudioObjectID>.size)

    let status = AudioObjectGetPropertyData(
      AudioObjectID(kAudioObjectSystemObject),
      &address,
      0,
      nil,
      &size,
      &deviceID
    )

    if status != noErr || deviceID == 0 || deviceID == kAudioObjectUnknown {
      throw AudioDeviceManagerError.failedToResolveDefaultInputDevice(status: status)
    }

    return deviceID
  }

  public static func getInputDeviceID(uid: String) throws -> AudioObjectID {
    let devices = try listInputDevices()
    if let found = devices.first(where: { $0.uid == uid }) {
      return AudioObjectID(found.id)
    }
    throw AudioDeviceManagerError.inputDeviceUIDNotFound(uid: uid)
  }

  public static func listInputDevices() throws -> [AudioInputDeviceInfo] {
    let deviceIDs = try listAllDeviceIDs()

    var results: [AudioInputDeviceInfo] = []
    for deviceID in deviceIDs {
      if !isAudioDeviceValid(deviceID) { continue }
      if !deviceHasInput(deviceID) { continue }

      let uid = try readStringProperty(deviceID: deviceID, selector: kAudioDevicePropertyDeviceUID)
      let name = try readStringProperty(deviceID: deviceID, selector: kAudioObjectPropertyName)

      results.append(AudioInputDeviceInfo(id: UInt32(deviceID), uid: uid, name: name))
    }

    return results.sorted { $0.name.localizedCaseInsensitiveCompare($1.name) == .orderedAscending }
  }

  private static func listAllDeviceIDs() throws -> [AudioObjectID] {
    var address = getPropertyAddress(selector: kAudioHardwarePropertyDevices)
    var size: UInt32 = 0

    let sizeStatus = AudioObjectGetPropertyDataSize(
      AudioObjectID(kAudioObjectSystemObject),
      &address,
      0,
      nil,
      &size
    )
    if sizeStatus != noErr {
      throw AudioDeviceManagerError.failedToResolveAllDevices(status: sizeStatus)
    }

    let deviceCount = Int(size) / MemoryLayout<AudioObjectID>.size
    var deviceIDs = Array(repeating: AudioObjectID(0), count: deviceCount)

    let dataStatus = AudioObjectGetPropertyData(
      AudioObjectID(kAudioObjectSystemObject),
      &address,
      0,
      nil,
      &size,
      &deviceIDs
    )
    if dataStatus != noErr {
      throw AudioDeviceManagerError.failedToResolveAllDevices(status: dataStatus)
    }

    return deviceIDs
  }

  private static func readStringProperty(
    deviceID: AudioObjectID,
    selector: AudioObjectPropertySelector
  ) throws -> String {
    var address = getPropertyAddress(selector: selector)
    var unmanaged: Unmanaged<CFString>? = nil
    var size = UInt32(MemoryLayout<Unmanaged<CFString>?>.size)

    let status = AudioObjectGetPropertyData(deviceID, &address, 0, nil, &size, &unmanaged)
    if status != noErr {
      throw AudioDeviceManagerError.failedToReadDeviceProperty(selector: selector, status: status)
    }

    guard let value = unmanaged?.takeUnretainedValue() else {
      throw AudioDeviceManagerError.failedToReadDeviceProperty(selector: selector, status: status)
    }

    return value as String
  }

  private static func deviceHasInput(_ deviceID: AudioObjectID) -> Bool {
    var address = getPropertyAddress(
      selector: kAudioDevicePropertyStreamConfiguration,
      scope: kAudioDevicePropertyScopeInput
    )
    var size: UInt32 = 0

    let sizeStatus = AudioObjectGetPropertyDataSize(deviceID, &address, 0, nil, &size)
    if sizeStatus != noErr {
      return false
    }

    let rawPtr = UnsafeMutableRawPointer.allocate(
      byteCount: Int(size),
      alignment: MemoryLayout<AudioBufferList>.alignment
    )
    defer { rawPtr.deallocate() }

    let bufferListPtr = rawPtr.bindMemory(to: AudioBufferList.self, capacity: 1)
    let dataStatus = AudioObjectGetPropertyData(deviceID, &address, 0, nil, &size, bufferListPtr)
    if dataStatus != noErr {
      return false
    }

    let buffers = UnsafeMutableAudioBufferListPointer(bufferListPtr)
    for buffer in buffers {
      if buffer.mNumberChannels > 0 {
        return true
      }
    }
    return false
  }
}
