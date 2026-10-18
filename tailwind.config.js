/** @type {import('tailwindcss').Config} */
module.exports = {
    content: [
        './index.html',
        './js/**/*.js'
    ],
    // JS 动态拼接的类名（模板字符串），扫描器可能漏掉，这里兜底
    safelist: [
        'hidden',
        { pattern: /^(from|to)-(slate|orange|sky|rose|emerald|teal|pink|red|blue|green|yellow|amber|cyan|fuchsia|purple|violet)-(400|500|600|800)$/ },
        { pattern: /^bg-gradient-to-(b|r|br|tr)$/ }
    ],
    theme: { extend: {} },
    plugins: []
};
