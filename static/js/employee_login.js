// Employee Login JavaScript

// Device Fingerprinting Function (same as in employee_dashboard.js)
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

document.addEventListener('DOMContentLoaded', function() {
    const loginForm = document.getElementById('loginForm');
    
    loginForm.addEventListener('submit', function(event) {
        event.preventDefault();
        
        const empId = document.getElementById('empId').value;
        const password = document.getElementById('empPassword').value;
        
        // Basic validation
        if (!empId || !password) {
            alert('Please fill in all fields');
            return;
        }
        
        // Generate device fingerprint (reuse function from employee_dashboard.js if available)
        let deviceFingerprint = null;
        try {
            // Try to get fingerprint from sessionStorage first
            deviceFingerprint = sessionStorage.getItem('deviceFingerprint');
            if (!deviceFingerprint) {
                // Generate new fingerprint
                deviceFingerprint = generateDeviceFingerprint();
                sessionStorage.setItem('deviceFingerprint', deviceFingerprint);
            }
        } catch (e) {
            console.error('Error generating fingerprint:', e);
        }
        
        // Send login request to server
        fetch('/employee/login', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                empId: empId,
                password: password,
                deviceFingerprint: deviceFingerprint
            })
        })
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                // Store employee info in sessionStorage
                sessionStorage.setItem('employeeId', data.employeeId);
                sessionStorage.setItem('employeeName', data.employeeName || 'Employee');
                // Redirect to dashboard
                window.location.href = '/employee/dashboard';
            } else {
                alert(data.message || 'Login failed. Please check your credentials.');
            }
        })
        .catch(error => {
            console.error('Error:', error);
            // For development: allow login without backend
            sessionStorage.setItem('employeeId', empId);
            sessionStorage.setItem('employeeName', 'Employee');
            window.location.href = '/employee/dashboard';
        });
    });
});


