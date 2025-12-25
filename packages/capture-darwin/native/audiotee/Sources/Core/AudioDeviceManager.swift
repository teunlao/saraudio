import CoreAudio
import Foundation

public enum AudioDeviceManagerError: Error {
  case failedToResolveDefaultInputDevice(status: OSStatus)
}

public class AudioDeviceManager {
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
}

