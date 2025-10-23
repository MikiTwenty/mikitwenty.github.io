document.querySelectorAll('.link-button').forEach(link => {
    link.addEventListener('click', function(e) {
        const linkData = this.getAttribute('data-link') || this.href;
        if (typeof gtag !== 'undefined') {
            gtag('event', 'click', {
                'event_category': 'Portfolio Links',
                'event_label': linkData,
                'value': 1
            });
        }
    });
});

document.querySelectorAll('.social-icon.active').forEach(icon => {
    icon.addEventListener('click', function(e) {
        const socialPlatform = this.getAttribute('title') || 'Social';
        if (typeof gtag !== 'undefined') {
            gtag('event', 'social_click', {
                'event_category': 'Social Media',
                'event_label': socialPlatform,
                'value': 1
            });
        }
    });
});

document.addEventListener('DOMContentLoaded', function() {
    if (typeof gtag !== 'undefined') {
        gtag('event', 'page_view', {
            'page_title': document.title,
            'page_location': window.location.href
        });
    }
    document.body.classList.add('loaded');
});

function copyToClipboard(text) {
    navigator.clipboard.writeText(text).then(function() {
        const notification = document.createElement('div');
        notification.textContent = 'Copied to clipboard!';
        notification.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background: rgba(0, 0, 0, 0.8);
            color: white;
            padding: 12px 20px;
            border-radius: 8px;
            font-size: 14px;
            z-index: 1000;
            animation: slideIn 0.3s ease;
        `;

        document.body.appendChild(notification);

        setTimeout(() => {
            notification.remove();
        }, 3000);
    });
}
