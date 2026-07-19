import sys

path = r'c:\Users\Usuario\Documents\Javier Frias\Antigravity\coordinadors\coordinadores-app\src\migrador\migrador.html'
with open(path, 'r', encoding='utf-8') as f:
    c = f.read()

target = """.step-content {
            padding: 28px;
            display: none;
        .btn-primary:hover:not(:disabled) {"""

if target not in c:
    print('Pattern not found. Trying simpler search.')
    target = ".step-content {\n            padding: 28px;\n            display: none;\n        .btn-primary:hover:not(:disabled) {"

if target not in c:
    print('Still not found. Quitting.')
    sys.exit(1)

css = """.step-content {
            padding: 28px;
            display: none;
            flex-grow: 1;
        }

        .step-content.active {
            display: block;
        }

        /* Botones y Formulario */
        .form-group {
            margin-bottom: 20px;
        }

        .form-group label {
            display: block;
            font-size: 13px;
            font-weight: 700;
            color: var(--primary);
            margin-bottom: 8px;
            text-transform: uppercase;
            letter-spacing: 0.5px;
        }

        select, input[type="text"] {
            width: 100%;
            padding: 10px 16px;
            border: 1px solid var(--border);
            border-radius: 8px;
            font-size: 13px;
            font-family: inherit;
            outline: none;
            background: #ffffff;
            box-sizing: border-box;
            transition: border 0.2s;
        }

        select:focus, input[type="text"]:focus {
            border-color: var(--primary-accent);
        }

        .radio-group {
            display: flex;
            gap: 16px;
            margin-top: 8px;
        }

        .radio-option {
            flex: 1;
            border: 1px solid var(--border);
            border-radius: 10px;
            padding: 14px 18px;
            cursor: pointer;
            transition: all 0.2s;
            display: flex;
            align-items: flex-start;
            gap: 10px;
            user-select: none;
            -webkit-user-select: none;
        }

        .radio-option:hover {
            border-color: var(--primary-accent);
            background: #fcfdfe;
        }

        .radio-option.selected {
            border-color: var(--primary);
            background: rgba(6, 57, 49, 0.03);
            box-shadow: 0 0 0 2px rgba(6, 57, 49, 0.1);
        }

        .radio-option input[type="radio"] {
            margin-top: 3px;
            pointer-events: none;
        }

        .radio-title {
            font-weight: 700;
            font-size: 13px;
            color: var(--text-main);
        }

        .radio-desc {
            font-size: 11px;
            color: var(--text-muted);
            margin-top: 2px;
        }

        .btn {
            padding: 10px 24px;
            border-radius: 8px;
            font-size: 12px;
            font-weight: 600;
            cursor: pointer;
            border: 1px solid transparent;
            font-family: inherit;
            transition: all 0.2s;
            display: inline-flex;
            align-items: center;
            gap: 6px;
        }

        .btn-primary {
            background: var(--primary);
            color: white;
            border-color: var(--primary);
        }

        .btn-primary:hover:not(:disabled) {"""

c = c.replace(target, css)

with open(path, 'w', encoding='utf-8') as f:
    f.write(c)

print('Done')
