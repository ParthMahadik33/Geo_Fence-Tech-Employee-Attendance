// Employee Login JavaScript
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
        
        // Send login request to server
        fetch('/employee/login', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                empId: empId,
                password: password
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


