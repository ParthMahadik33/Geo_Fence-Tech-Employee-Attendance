// Employee Dashboard JavaScript

// Geofence configuration (will be loaded from server)
let GEOFENCE_CONFIG = {
    latitude: 28.7041,  // Default: Delhi coordinates
    longitude: 77.1025,
    radius: 100  // radius in meters
};

// Device Fingerprinting Function
function generateDeviceFingerprint() {
    // Collect browser and OS information
    const fingerprint = {
        userAgent: navigator.userAgent,
        platform: navigator.platform,
        language: navigator.language,
        languages: navigator.languages ? navigator.languages.join(',') : '',
        screenWidth: screen.width,
        screenHeight: screen.height,
        screenColorDepth: screen.colorDepth,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        timezoneOffset: new Date().getTimezoneOffset(),
        hardwareConcurrency: navigator.hardwareConcurrency || 0,
        deviceMemory: navigator.deviceMemory || 0,
        maxTouchPoints: navigator.maxTouchPoints || 0,
        cookieEnabled: navigator.cookieEnabled,
        doNotTrack: navigator.doNotTrack || 'unknown',
        canvasFingerprint: getCanvasFingerprint(),
        webglFingerprint: getWebGLFingerprint()
    };
    
    // Create a hash of the fingerprint
    const fingerprintString = JSON.stringify(fingerprint);
    return btoa(fingerprintString).substring(0, 128); // Base64 encode and limit length
}

// Get Canvas Fingerprint
function getCanvasFingerprint() {
    try {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        ctx.textBaseline = 'top';
        ctx.font = '14px Arial';
        ctx.fillText('Device fingerprint test 🔒', 2, 2);
        return canvas.toDataURL().substring(0, 50);
    } catch (e) {
        return 'canvas_not_supported';
    }
}

// Get WebGL Fingerprint
function getWebGLFingerprint() {
    try {
        const canvas = document.createElement('canvas');
        const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
        if (!gl) return 'webgl_not_supported';
        
        const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
        if (debugInfo) {
            return gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL).substring(0, 50);
        }
        return 'webgl_no_debug_info';
    } catch (e) {
        return 'webgl_error';
    }
}

let checkInTime = null;
let checkOutTime = null;
let locationWatchId = null;
let deviceRegistered = false;
let deviceApproved = false;
let cameraStream = null;
let capturedPhotoData = null;
let pendingCheckInData = null;

// Initialize dashboard
document.addEventListener('DOMContentLoaded', function() {
    // Check if employee is logged in
    const employeeId = sessionStorage.getItem('employeeId');
    const employeeName = sessionStorage.getItem('employeeName');
    
    if (!employeeId) {
        window.location.href = '/employee/login';
        return;
    }
    
    // Set employee name
    if (employeeName) {
        document.getElementById('employeeName').textContent = employeeName;
    }
    
    // Load device status and geofence config first
    loadDeviceStatus();
    loadGeofenceConfig();
    
    // Load today's attendance
    loadAttendance();
});

// Load device status
function loadDeviceStatus() {
    fetch('/employee/device-status')
        .then(response => response.json())
        .then(data => {
            const deviceStatusEl = document.getElementById('deviceStatus');
            const registerDeviceBtn = document.getElementById('registerDeviceBtn');
            
            if (data.success) {
                deviceRegistered = !!data.deviceId;
                deviceApproved = data.deviceApproved;
                
                if (deviceRegistered && deviceApproved) {
                    deviceStatusEl.textContent = `✓ Device Registered: ${data.deviceId}`;
                    deviceStatusEl.style.color = '#38a169';
                    registerDeviceBtn.style.display = 'none';
                    // Start location monitoring once device is registered
                    checkLocation();
                    startLocationMonitoring();
                } else if (deviceRegistered && !deviceApproved) {
                    deviceStatusEl.textContent = '⏳ Device registration pending admin approval';
                    deviceStatusEl.style.color = '#d69e2e';
                    registerDeviceBtn.style.display = 'none';
                } else {
                    deviceStatusEl.textContent = '✗ No device registered. Please register your device.';
                    deviceStatusEl.style.color = '#e53e3e';
                    registerDeviceBtn.style.display = 'inline-block';
                }
            } else {
                deviceStatusEl.textContent = '✗ Error checking device status';
                deviceStatusEl.style.color = '#e53e3e';
                registerDeviceBtn.style.display = 'inline-block';
            }
        })
        .catch(error => {
            console.error('Error loading device status:', error);
            const deviceStatusEl = document.getElementById('deviceStatus');
            deviceStatusEl.textContent = '✗ Error checking device status';
            deviceStatusEl.style.color = '#e53e3e';
        });
}

// Load geofence configuration from server
function loadGeofenceConfig() {
    fetch('/employee/geofence-config')
        .then(response => response.json())
        .then(data => {
            if (data.success && data.config) {
                GEOFENCE_CONFIG = data.config;
                // If device is already registered, start checking location
                if (deviceRegistered && deviceApproved) {
                    checkLocation();
                }
            }
        })
        .catch(error => {
            console.error('Error loading geofence config:', error);
        });
}

// Check if user is inside geofence
function checkLocation() {
    // Only check location if device is registered and approved
    if (!deviceRegistered || !deviceApproved) {
        const statusText = document.getElementById('locationStatus');
        const statusIndicator = document.getElementById('statusIndicator');
        const checkInBtn = document.getElementById('checkInBtn');
        
        statusText.textContent = 'Please register and get your device approved to check in';
        statusText.style.color = '#e53e3e';
        statusIndicator.className = 'status-indicator inactive';
        checkInBtn.disabled = true;
        return;
    }
    
    const statusText = document.getElementById('locationStatus');
    const statusIndicator = document.getElementById('statusIndicator');
    const checkInBtn = document.getElementById('checkInBtn');
    const checkOutBtn = document.getElementById('checkOutBtn');
    
    statusText.textContent = 'Checking your location...';
    statusIndicator.className = 'status-indicator';
    
    if (!navigator.geolocation) {
        statusText.textContent = 'Geolocation is not supported by your browser';
        statusText.style.color = '#e53e3e';
        statusIndicator.className = 'status-indicator inactive';
        checkInBtn.disabled = true;
        return;
    }
    
    navigator.geolocation.getCurrentPosition(
        function(position) {
            const userLat = position.coords.latitude;
            const userLon = position.coords.longitude;
            
            // Calculate distance from geofence center
            const distance = calculateDistance(
                GEOFENCE_CONFIG.latitude,
                GEOFENCE_CONFIG.longitude,
                userLat,
                userLon
            );
            
            if (distance <= GEOFENCE_CONFIG.radius) {
                // Inside geofence
                statusText.textContent = `✓ You are inside the geofence area (${Math.round(distance)}m from center)`;
                statusText.style.color = '#38a169';
                statusIndicator.className = 'status-indicator active';
                // Only enable check-in if device is registered and approved
                checkInBtn.disabled = !(deviceRegistered && deviceApproved);
            } else {
                // Outside geofence
                statusText.textContent = `✗ You are outside the geofence area (${Math.round(distance)}m from center)`;
                statusText.style.color = '#e53e3e';
                statusIndicator.className = 'status-indicator inactive';
                checkInBtn.disabled = true;
            }
        },
        function(error) {
            statusText.textContent = 'Unable to retrieve your location. Please enable location services.';
            statusText.style.color = '#e53e3e';
            statusIndicator.className = 'status-indicator inactive';
            checkInBtn.disabled = true;
            console.error('Geolocation error:', error);
        },
        {
            enableHighAccuracy: true,
            timeout: 10000,
            maximumAge: 0
        }
    );
}

// Start continuous location monitoring
function startLocationMonitoring() {
    // Check location every 30 seconds
    locationWatchId = setInterval(checkLocation, 30000);
}

// Calculate distance between two coordinates using Haversine formula
function calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371000; // Earth's radius in meters
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = 
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}

// Check in function - opens camera first
function checkIn() {
    const checkInBtn = document.getElementById('checkInBtn');
    const checkOutBtn = document.getElementById('checkOutBtn');
    
    // Verify device is registered and approved
    if (!deviceRegistered || !deviceApproved) {
        alert('Please register and get your device approved before checking in');
        return;
    }
    
    if (checkInBtn.disabled) {
        alert('You must be inside the geofence area to check in');
        return;
    }
    
    // Get current location first
    navigator.geolocation.getCurrentPosition(
        function(position) {
            const userLat = position.coords.latitude;
            const userLon = position.coords.longitude;
            
            // Verify user is still within geofence
            const distance = calculateDistance(
                GEOFENCE_CONFIG.latitude,
                GEOFENCE_CONFIG.longitude,
                userLat,
                userLon
            );
            
            if (distance > GEOFENCE_CONFIG.radius) {
                alert('You are outside the geofence area. Please move within the geofence to check in.');
                checkLocation(); // Update UI
                return;
            }
            
            // Store check-in data for later submission (timestamp will be set when photo is submitted)
            const employeeId = sessionStorage.getItem('employeeId');
            pendingCheckInData = {
                employeeId: employeeId,
                latitude: userLat,
                longitude: userLon
                // timestamp will be generated when photo is actually submitted
            };
            
            // Open camera modal
            openCamera();
        },
        function(error) {
            alert('Unable to get your location for check-in');
            console.error('Geolocation error:', error);
        }
    );
}

// Open camera modal and start camera
function openCamera() {
    const modal = document.getElementById('cameraModal');
    const video = document.getElementById('cameraVideo');
    const capturedPhoto = document.getElementById('capturedPhoto');
    const captureBtn = document.getElementById('captureBtn');
    const retakeBtn = document.getElementById('retakeBtn');
    const submitPhotoBtn = document.getElementById('submitPhotoBtn');
    
    // Reset UI
    capturedPhoto.style.display = 'none';
    video.style.display = 'block';
    captureBtn.style.display = 'inline-block';
    retakeBtn.style.display = 'none';
    submitPhotoBtn.style.display = 'none';
    capturedPhotoData = null;
    
    // Show modal
    modal.style.display = 'flex';
    
    // Request access to front camera
    navigator.mediaDevices.getUserMedia({
        video: {
            facingMode: 'user', // Front camera
            width: { ideal: 640 },
            height: { ideal: 480 }
        },
        audio: false
    })
    .then(function(stream) {
        cameraStream = stream;
        video.srcObject = stream;
    })
    .catch(function(error) {
        console.error('Error accessing camera:', error);
        alert('Unable to access camera. Please allow camera permissions and try again.');
        closeCamera();
    });
}

// Close camera modal
function closeCamera() {
    const modal = document.getElementById('cameraModal');
    
    // Stop camera stream
    if (cameraStream) {
        cameraStream.getTracks().forEach(track => track.stop());
        cameraStream = null;
    }
    
    // Hide modal
    modal.style.display = 'none';
    pendingCheckInData = null;
    capturedPhotoData = null;
}

// Capture photo from video stream
function capturePhoto() {
    const video = document.getElementById('cameraVideo');
    const canvas = document.getElementById('cameraCanvas');
    const capturedPhoto = document.getElementById('capturedPhoto');
    const captureBtn = document.getElementById('captureBtn');
    const retakeBtn = document.getElementById('retakeBtn');
    const submitPhotoBtn = document.getElementById('submitPhotoBtn');
    
    // Set canvas dimensions to match video
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    
    // Draw video frame to canvas
    const ctx = canvas.getContext('2d');
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    
    // Convert canvas to base64 image
    capturedPhotoData = canvas.toDataURL('image/jpeg', 0.8);
    
    // Show captured photo
    capturedPhoto.src = capturedPhotoData;
    capturedPhoto.style.display = 'block';
    video.style.display = 'none';
    
    // Update buttons
    captureBtn.style.display = 'none';
    retakeBtn.style.display = 'inline-block';
    submitPhotoBtn.style.display = 'inline-block';
    
    // Stop camera stream
    if (cameraStream) {
        cameraStream.getTracks().forEach(track => track.stop());
        cameraStream = null;
    }
}

// Retake photo
function retakePhoto() {
    const video = document.getElementById('cameraVideo');
    const capturedPhoto = document.getElementById('capturedPhoto');
    const captureBtn = document.getElementById('captureBtn');
    const retakeBtn = document.getElementById('retakeBtn');
    const submitPhotoBtn = document.getElementById('submitPhotoBtn');
    
    // Reset UI
    capturedPhoto.style.display = 'none';
    video.style.display = 'block';
    captureBtn.style.display = 'inline-block';
    retakeBtn.style.display = 'none';
    submitPhotoBtn.style.display = 'none';
    capturedPhotoData = null;
    
    // Restart camera
    navigator.mediaDevices.getUserMedia({
        video: {
            facingMode: 'user',
            width: { ideal: 640 },
            height: { ideal: 480 }
        },
        audio: false
    })
    .then(function(stream) {
        cameraStream = stream;
        video.srcObject = stream;
    })
    .catch(function(error) {
        console.error('Error accessing camera:', error);
        alert('Unable to access camera. Please try again.');
    });
}

// Submit check-in with photo
function submitCheckInWithPhoto() {
    if (!capturedPhotoData || !pendingCheckInData) {
        alert('Please capture a photo first');
        return;
    }
    
    const checkInBtn = document.getElementById('checkInBtn');
    const checkOutBtn = document.getElementById('checkOutBtn');
    const submitPhotoBtn = document.getElementById('submitPhotoBtn');
    
    // Disable button during submission
    submitPhotoBtn.disabled = true;
    submitPhotoBtn.textContent = 'Submitting...';
    
    // Generate timestamp at the moment of submission (not when location was checked)
    const actualTimestamp = new Date().toISOString();
    
    // Get device fingerprint
    const deviceFingerprint = sessionStorage.getItem('deviceFingerprint') || generateDeviceFingerprint();
    
    // Prepare form data
    const formData = new FormData();
    formData.append('employeeId', pendingCheckInData.employeeId);
    formData.append('latitude', pendingCheckInData.latitude);
    formData.append('longitude', pendingCheckInData.longitude);
    formData.append('timestamp', actualTimestamp);
    formData.append('deviceFingerprint', deviceFingerprint);
    formData.append('photo', dataURLtoBlob(capturedPhotoData), 'checkin_photo.jpg');
    
    // Send check-in with photo to server
    fetch('/employee/checkin', {
        method: 'POST',
        body: formData
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            // Use server timestamp if provided, otherwise use the timestamp we sent
            const serverTimestamp = data.timestamp || actualTimestamp;
            checkInTime = new Date(serverTimestamp);
            
            // Format time with seconds for accuracy
            const timeString = checkInTime.toLocaleTimeString('en-US', {
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit',
                hour12: true
            });
            
            document.getElementById('checkInTime').textContent = timeString;
            document.getElementById('attendanceInfo').style.display = 'block';
            checkInBtn.disabled = true;
            checkOutBtn.disabled = false;
            
            // Close camera modal
            closeCamera();
            
            alert('Check-in successful with photo!');
        } else {
            alert(data.message || 'Check-in failed. Please try again.');
            submitPhotoBtn.disabled = false;
            submitPhotoBtn.innerHTML = '<span class="icon">✓</span> Confirm Check-In';
        }
    })
    .catch(error => {
        console.error('Error:', error);
        alert('Check-in failed. Please try again.');
        submitPhotoBtn.disabled = false;
        submitPhotoBtn.innerHTML = '<span class="icon">✓</span> Confirm Check-In';
    });
}

// Convert data URL to Blob for file upload
function dataURLtoBlob(dataURL) {
    const arr = dataURL.split(',');
    const mime = arr[0].match(/:(.*?);/)[1];
    const bstr = atob(arr[1]);
    let n = bstr.length;
    const u8arr = new Uint8Array(n);
    while (n--) {
        u8arr[n] = bstr.charCodeAt(n);
    }
    return new Blob([u8arr], { type: mime });
}

// Check out function
function checkOut() {
    const checkOutBtn = document.getElementById('checkOutBtn');
    const checkInBtn = document.getElementById('checkInBtn');
    
    // Verify device is registered and approved
    if (!deviceRegistered || !deviceApproved) {
        alert('Please register and get your device approved before checking out');
        return;
    }
    
    if (checkOutBtn.disabled) {
        alert('You must check in first before checking out');
        return;
    }
    
    // Get current location
    navigator.geolocation.getCurrentPosition(
        function(position) {
            const userLat = position.coords.latitude;
            const userLon = position.coords.longitude;
            
            // Get device fingerprint
            const deviceFingerprint = sessionStorage.getItem('deviceFingerprint') || generateDeviceFingerprint();
            
            const employeeId = sessionStorage.getItem('employeeId');
            const checkOutData = {
                employeeId: employeeId,
                latitude: userLat,
                longitude: userLon,
                timestamp: new Date().toISOString(),
                deviceFingerprint: deviceFingerprint
            };
            
            // Send check-out to server
            fetch('/employee/checkout', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(checkOutData)
            })
            .then(response => response.json())
            .then(data => {
                if (data.success) {
                    checkOutTime = new Date(data.timestamp || new Date());
                    const timeString = checkOutTime.toLocaleTimeString('en-US', {
                        hour: '2-digit',
                        minute: '2-digit',
                        second: '2-digit',
                        hour12: true
                    });
                    document.getElementById('checkOutTime').textContent = timeString;
                    document.getElementById('attendanceInfo').style.display = 'block';
                    checkOutBtn.disabled = true;
                    checkInBtn.disabled = true; // Can't check in again on the same day
                    alert('Check-out successful!');
                } else {
                    alert(data.message || 'Check-out failed. Please try again.');
                }
            })
            .catch(error => {
                console.error('Error:', error);
                alert('Check-out failed. Please try again.');
            });
        },
        function(error) {
            alert('Unable to get your location for check-out');
            console.error('Geolocation error:', error);
        }
    );
}

// Register device function
function registerDevice() {
    const employeeId = sessionStorage.getItem('employeeId');
    
    if (!employeeId) {
        alert('Please log in to register your device');
        return;
    }
    
    // Generate device fingerprint
    const deviceFingerprint = generateDeviceFingerprint();
    
    // Store fingerprint in sessionStorage for verification
    sessionStorage.setItem('deviceFingerprint', deviceFingerprint);
    
    // Get device information
    const deviceInfo = {
        employeeId: employeeId,
        userAgent: navigator.userAgent,
        platform: navigator.platform,
        deviceFingerprint: deviceFingerprint,
        timestamp: new Date().toISOString()
    };
    
    // Send device registration request
    fetch('/employee/register-device', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(deviceInfo)
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            alert('Device registration request submitted. Waiting for admin approval.');
            // Reload device status
            loadDeviceStatus();
        } else {
            alert(data.message || 'Device registration failed. Please try again.');
        }
    })
    .catch(error => {
        console.error('Error:', error);
        alert('Error submitting device registration. Please try again.');
    });
}

// Verify device fingerprint (called on login and check-in)
function verifyDeviceFingerprint() {
    const storedFingerprint = sessionStorage.getItem('deviceFingerprint');
    const currentFingerprint = generateDeviceFingerprint();
    
    // If no stored fingerprint, this is first time - allow but warn
    if (!storedFingerprint) {
        return { valid: true, message: 'No stored fingerprint' };
    }
    
    // Compare fingerprints (allow small variations for browser updates)
    if (storedFingerprint === currentFingerprint) {
        return { valid: true, message: 'Fingerprint matches' };
    } else {
        return { valid: false, message: 'Device fingerprint mismatch - possible unauthorized device' };
    }
}

// Load today's attendance
function loadAttendance() {
    const employeeId = sessionStorage.getItem('employeeId');
    
    fetch(`/employee/attendance/${employeeId}`)
        .then(response => response.json())
        .then(data => {
            if (data.success && data.attendance) {
                if (data.attendance.checkIn) {
                    checkInTime = new Date(data.attendance.checkIn);
                    // Format time with seconds for accuracy
                    const timeString = checkInTime.toLocaleTimeString('en-US', {
                        hour: '2-digit',
                        minute: '2-digit',
                        second: '2-digit',
                        hour12: true
                    });
                    document.getElementById('checkInTime').textContent = timeString;
                    document.getElementById('checkInBtn').disabled = true;
                }
                if (data.attendance.checkOut) {
                    checkOutTime = new Date(data.attendance.checkOut);
                    const timeString = checkOutTime.toLocaleTimeString('en-US', {
                        hour: '2-digit',
                        minute: '2-digit',
                        second: '2-digit',
                        hour12: true
                    });
                    document.getElementById('checkOutTime').textContent = timeString;
                    document.getElementById('checkOutBtn').disabled = true; // Already checked out
                    document.getElementById('checkInBtn').disabled = true; // Can't check in again
                }
                if (checkInTime) {
                    document.getElementById('attendanceInfo').style.display = 'block';
                    // Only enable check-out if not already checked out
                    if (!data.attendance.checkOut) {
                        document.getElementById('checkOutBtn').disabled = false;
                    }
                }
            }
        })
        .catch(error => {
            console.error('Error loading attendance:', error);
        });
}

// Logout function
function logout() {
    if (locationWatchId) {
        clearInterval(locationWatchId);
    }
    sessionStorage.clear();
    window.location.href = '/';
}


