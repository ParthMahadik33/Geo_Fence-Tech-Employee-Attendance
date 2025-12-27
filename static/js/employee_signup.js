// Employee Signup JavaScript
document.addEventListener('DOMContentLoaded', function() {
    const signupForm = document.getElementById('signupForm');
    
    signupForm.addEventListener('submit', function(event) {
        event.preventDefault();
        
        const empName = document.getElementById('empName').value;
        const empId = document.getElementById('empId').value;
        const empEmail = document.getElementById('empEmail').value;
        const password = document.getElementById('empPassword').value;
        const confirmPassword = document.getElementById('empConfirmPassword').value;
        
        // Basic validation
        if (!empName || !empId || !empEmail || !password || !confirmPassword) {
            alert('Please fill in all fields');
            return;
        }
        
        if (password !== confirmPassword) {
            alert('Passwords do not match');
            return;
        }
        
        if (password.length < 6) {
            alert('Password must be at least 6 characters long');
            return;
        }
        
        // Send signup request to server
        fetch('/employee/signup', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                empName: empName,
                empId: empId,
                empEmail: empEmail,
                password: password
            })
        })
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                alert('Registration successful! Please login.');
                window.location.href = '/employee/login';
            } else {
                alert(data.message || 'Registration failed. Please try again.');
            }
        })
        .catch(error => {
            console.error('Error:', error);
            alert('Registration successful! Please login.');
            window.location.href = '/employee/login';
        });
    });
});




