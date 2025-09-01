// Claude prompt generation function
function toTwo(n) { return Number(n).toFixed(2); }

function fillClaudePrompt({
  CURRENCY_OR_SYMBOL = 'INR',
  SHORT_USER_INPUT_SUMMARY = 'Dinner ₹1450, 4 people, 10% tip, 5% tax, equal',
  SUBTOTAL, TAX, TIP, GRAND_TOTAL,
  PER_PERSON_RAW = null,
  PER_PERSON_ROUNDED = [],
  ROUNDING_ADJUSTMENTS = []
}) {
  const roundedArr = PER_PERSON_ROUNDED.map(x => toTwo(x));
  const adjustArr = ROUNDING_ADJUSTMENTS.map(x => toTwo(x));
  const perRawStr = PER_PERSON_RAW === null ? '' : String(PER_PERSON_RAW);

  return `
You are a clear, concise assistant that explains bill-splitting step-by-step. RETURN EXACTLY TWO SECTIONS separated by a line containing three hyphens (---). Do not add anything else.

SECTION 1 — a JSON object labelled (result_json) with ONLY these fields (numbers only, no currency symbols, two decimal places where applicable):
- subtotal (number)
- tax (number)
- tip (number)
- grand_total (number)
- per_person (array of numbers; final amounts each person pays)
- rounding_adjustments (array of numbers; final - raw for each person)

SECTION 2 — a human-readable explanation:
1. One-line summary stating grand total and per-person final amounts.
2. A numbered step-by-step arithmetic list showing formulas and numeric substitution that produced the numbers (use the exact provided numbers; show each step: tax calc, tip calc, grand total calc, per-person raw, rounding distribution).

IMPORTANT RULES:
- DO NOT RECALCULATE or alter any numbers. Use the values provided in the INPUT block exactly.
- Do not include extra commentary, fields, or sections.
- Use two decimal places for all currency numbers in the JSON and explanation.
- If per_person contains more than one value, show them in order (Person 1, Person 2, ...).

INPUT (use these values exactly — replace placeholders with your computed values before sending):
Currency: ${CURRENCY_OR_SYMBOL} 
Input summary: "${SHORT_USER_INPUT_SUMMARY}"
Provided computed values (use exactly, do not recalc):
subtotal = ${toTwo(SUBTOTAL)}
tax = ${toTwo(TAX)}
tip = ${toTwo(TIP)}
grand_total = ${toTwo(GRAND_TOTAL)}
per_person_raw = ${perRawStr}
per_person_rounded = [${roundedArr.join(',')}]
rounding_adjustments = [${adjustArr.join(',')}]

OUTPUT FORMAT EXAMPLE (follow structure exactly):
(result_json)
{"subtotal":1450.00,"tax":72.50,"tip":145.00,"grand_total":1667.50,"per_person":[416.88,416.88,416.87,416.87],"rounding_adjustments":[0.00,0.00,-0.01,-0.01]}

---
Summary: The grand total (1667.50) split among 4 people becomes 416.88, 416.88, 416.87, 416.87 after rounding.

Steps:
1) Tax = 1450.00 × 0.05 = 72.50
2) Tip = 1450.00 × 0.10 = 145.00
3) Grand total = 1450.00 + 72.50 + 145.00 = 1667.50
4) Per-person (raw) = 1667.50 ÷ 4 = 416.875 → rounded to two decimals
5) Final per-person amounts (rounded, distributed leftover cents): 416.88, 416.88, 416.87, 416.87
`.trim();
}

class BillSplitter {
    constructor() {
        this.initEventListeners();
        this.currencySymbols = { INR: '₹', USD: '$', EUR: '€' };
    }

    initEventListeners() {
        document.getElementById('form-mode').addEventListener('click', () => this.switchMode('form'));
        document.getElementById('nl-mode').addEventListener('click', () => this.switchMode('nl'));
        document.getElementById('submit').addEventListener('click', () => this.calculate());
        document.getElementById('share').addEventListener('click', () => this.shareResult());
        document.getElementById('generate-prompt').addEventListener('click', () => this.generateClaudePrompt());
    }

    switchMode(mode) {
        const formMode = document.getElementById('form-mode');
        const nlMode = document.getElementById('nl-mode');
        const formInput = document.getElementById('form-input');
        const nlInput = document.getElementById('nl-input');

        if (mode === 'form') {
            formMode.classList.add('active');
            nlMode.classList.remove('active');
            formInput.classList.remove('hidden');
            nlInput.classList.add('hidden');
        } else {
            nlMode.classList.add('active');
            formMode.classList.remove('active');
            nlInput.classList.remove('hidden');
            formInput.classList.add('hidden');
        }
    }

    parseNaturalLanguage(text) {
        const data = { total: 0, people: 1, tip: 0, tax: 0, currency: 'INR' };
        
        // Extract currency and amount
        const currencyMatch = text.match(/[₹$€](\d+(?:\.\d{2})?)/);
        if (currencyMatch) {
            data.total = parseFloat(currencyMatch[1]);
            if (text.includes('₹')) data.currency = 'INR';
            else if (text.includes('$')) data.currency = 'USD';
            else if (text.includes('€')) data.currency = 'EUR';
        } else {
            const amountMatch = text.match(/(\d+(?:\.\d{2})?)/);
            if (amountMatch) data.total = parseFloat(amountMatch[1]);
        }

        // Extract people count
        const peopleMatch = text.match(/(\d+)\s*people?/i);
        if (peopleMatch) data.people = parseInt(peopleMatch[1]);

        // Extract tip percentage
        const tipMatch = text.match(/(\d+(?:\.\d+)?)%?\s*tip/i);
        if (tipMatch) data.tip = parseFloat(tipMatch[1]);

        // Extract tax percentage
        const taxMatch = text.match(/(\d+(?:\.\d+)?)%?\s*tax/i);
        if (taxMatch) data.tax = parseFloat(taxMatch[1]);

        return data;
    }

    getFormData() {
        return {
            total: parseFloat(document.getElementById('total').value) || 0,
            currency: document.getElementById('currency').value,
            people: parseInt(document.getElementById('people').value) || 1,
            tip: parseFloat(document.getElementById('tip').value) || 0,
            tax: parseFloat(document.getElementById('tax').value) || 0,
            rounding: document.getElementById('rounding').value
        };
    }

    validate(data) {
        const errors = [];
        if (data.total <= 0) errors.push('Total amount must be positive');
        if (data.people < 1) errors.push('Number of people must be at least 1');
        if (data.tip < 0) errors.push('Tip percentage cannot be negative');
        if (data.tax < 0) errors.push('Tax percentage cannot be negative');
        return errors;
    }

    calculate() {
        const isNLMode = !document.getElementById('nl-input').classList.contains('hidden');
        let data;

        if (isNLMode) {
            const nlText = document.getElementById('nl-text').value.trim();
            if (!nlText) {
                alert('Please enter bill information');
                return;
            }
            data = this.parseNaturalLanguage(nlText);
        } else {
            data = this.getFormData();
        }

        const errors = this.validate(data);
        if (errors.length > 0) {
            alert(errors.join('\n'));
            return;
        }

        const result = this.performCalculation(data);
        this.displayResult(result, data);
    }

    performCalculation(data) {
        const steps = [];
        const symbol = this.currencySymbols[data.currency];
        
        // Calculate amounts
        const tipAmount = (data.total * data.tip) / 100;
        const taxAmount = (data.total * data.tax) / 100;
        const grandTotal = data.total + tipAmount + taxAmount;
        const basePerPerson = grandTotal / data.people;
        
        // Calculate per-person amounts with rounding distribution
        const perPersonAmounts = [];
        const roundingAdjustments = [];
        
        for (let i = 0; i < data.people; i++) {
            let amount = basePerPerson;
            if (data.rounding === 'up') {
                amount = Math.ceil(basePerPerson * 100) / 100;
            } else if (data.rounding === 'down') {
                amount = Math.floor(basePerPerson * 100) / 100;
            } else {
                amount = Math.round(basePerPerson * 100) / 100;
            }
            perPersonAmounts.push(amount);
            roundingAdjustments.push(amount - basePerPerson);
        }
        
        // Distribute remainder for exact splitting
        const totalAssigned = perPersonAmounts.reduce((sum, amt) => sum + amt, 0);
        const remainder = grandTotal - totalAssigned;
        
        if (Math.abs(remainder) > 0.001) {
            const centRemainder = Math.round(remainder * 100);
            for (let i = 0; i < Math.abs(centRemainder) && i < data.people; i++) {
                if (centRemainder > 0) {
                    perPersonAmounts[i] += 0.01;
                    roundingAdjustments[i] += 0.01;
                } else {
                    perPersonAmounts[i] -= 0.01;
                    roundingAdjustments[i] -= 0.01;
                }
            }
        }

        // Generate steps for display
        steps.push(`1. Tip (${data.tip}%): ${symbol}${data.total.toFixed(2)} × ${data.tip}% = ${symbol}${tipAmount.toFixed(2)}`);
        steps.push(`2. Tax (${data.tax}%): ${symbol}${data.total.toFixed(2)} × ${data.tax}% = ${symbol}${taxAmount.toFixed(2)}`);
        steps.push(`3. Grand Total: ${symbol}${data.total.toFixed(2)} + ${symbol}${tipAmount.toFixed(2)} + ${symbol}${taxAmount.toFixed(2)} = ${symbol}${grandTotal.toFixed(2)}`);
        steps.push(`4. Per Person (raw): ${symbol}${grandTotal.toFixed(2)} ÷ ${data.people} = ${symbol}${basePerPerson.toFixed(3)}`);
        steps.push(`5. Final amounts: ${perPersonAmounts.map(amt => `${symbol}${amt.toFixed(2)}`).join(', ')}`);

        return {
            original: data.total,
            tipAmount,
            taxAmount,
            grandTotal,
            basePerPerson,
            perPersonAmounts,
            roundingAdjustments,
            steps,
            currency: data.currency,
            people: data.people,
            inputSummary: this.generateInputSummary(data)
        };
    }

    generateInputSummary(data) {
        const symbol = this.currencySymbols[data.currency];
        let summary = `Bill ${symbol}${data.total.toFixed(2)}, ${data.people} people`;
        if (data.tip > 0) summary += `, ${data.tip}% tip`;
        if (data.tax > 0) summary += `, ${data.tax}% tax`;
        summary += ', split equally';
        return summary;
    }

    displayResult(result, data) {
        const symbol = this.currencySymbols[result.currency];
        
        // Numbers panel
        const numbersHtml = `
            <div><strong>Original Bill:</strong> ${symbol}${result.original.toFixed(2)}</div>
            <div><strong>Tip (${data.tip}%):</strong> ${symbol}${result.tipAmount.toFixed(2)}</div>
            <div><strong>Tax (${data.tax}%):</strong> ${symbol}${result.taxAmount.toFixed(2)}</div>
            <div><strong>Grand Total:</strong> ${symbol}${result.grandTotal.toFixed(2)}</div>
            <div style="margin-top: 10px; font-size: 16px;"><strong>Per Person:</strong></div>
            ${result.perPersonAmounts.map((amt, i) => `<div>Person ${i+1}: ${symbol}${amt.toFixed(2)}</div>`).join('')}
        `;

        // Steps panel
        const stepsHtml = result.steps.map(step => `<div>${step}</div>`).join('');

        // Explanation panel
        const explanationHtml = `
            <div>Split ${symbol}${result.grandTotal.toFixed(2)} among ${result.people} people.</div>
            <div style="margin-top: 10px;">Amounts: ${result.perPersonAmounts.map(amt => `${symbol}${amt.toFixed(2)}`).join(', ')}</div>
        `;

        document.getElementById('numbers').innerHTML = numbersHtml;
        document.getElementById('steps').innerHTML = stepsHtml;
        document.getElementById('explanation').innerHTML = explanationHtml;
        document.getElementById('result').classList.remove('hidden');

        // Store result for sharing and Claude prompt
        this.lastResult = { result, data };
    }

    shareResult() {
        if (!this.lastResult) return;
        
        const { result, data } = this.lastResult;
        const symbol = this.currencySymbols[result.currency];
        
        const shareText = `Bill Split Result:
Original: ${symbol}${result.original.toFixed(2)}
Tip: ${symbol}${result.tipAmount.toFixed(2)}
Tax: ${symbol}${result.taxAmount.toFixed(2)}
Total: ${symbol}${result.grandTotal.toFixed(2)}
Per person: ${result.perPersonAmounts.map(amt => `${symbol}${amt.toFixed(2)}`).join(', ')}`;

        if (navigator.share) {
            navigator.share({
                title: 'Bill Split Result',
                text: shareText
            });
        } else {
            navigator.clipboard.writeText(shareText).then(() => {
                alert('Result copied to clipboard!');
            });
        }
    }

    generateClaudePrompt() {
        if (!this.lastResult) {
            alert('No calculation result available. Please calculate a bill split first.');
            return;
        }

        const { result, data } = this.lastResult;
        
        const prompt = fillClaudePrompt({
            CURRENCY_OR_SYMBOL: result.currency,
            SHORT_USER_INPUT_SUMMARY: result.inputSummary,
            SUBTOTAL: result.original,
            TAX: result.taxAmount,
            TIP: result.tipAmount,
            GRAND_TOTAL: result.grandTotal,
            PER_PERSON_RAW: result.basePerPerson,
            PER_PERSON_ROUNDED: result.perPersonAmounts,
            ROUNDING_ADJUSTMENTS: result.roundingAdjustments
        });

        // Copy to clipboard
        navigator.clipboard.writeText(prompt).then(() => {
            alert('AI prompt copied to clipboard! You can now paste it into any AI for detailed explanation.');
        }).catch(() => {
            // Fallback: show in a modal or new window
            const newWindow = window.open('', '_blank');
            newWindow.document.write(`<pre style="white-space: pre-wrap; font-family: monospace; padding: 20px;">${prompt}</pre>`);
            newWindow.document.title = 'Claude Prompt';
        });
    }
}

// Initialize the app
new BillSplitter();