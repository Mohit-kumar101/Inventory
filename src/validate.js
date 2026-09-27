const LIMITS = {
  fgNumber: 80,
  description: 300,
  partNumber: 80,
  company: 120,
  technician: 80,
  workOrder: 80,
};

export function cleanText(value, max) {
  return String(value ?? '')
    .replace(/[\u0000-\u001F\u007F]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

export function validateDetails(values) {
  const errors = {};
  const fgNumber = cleanText(values.fgNumber, LIMITS.fgNumber);
  const description = cleanText(values.description, LIMITS.description);
  const partNumber = cleanText(values.partNumber, LIMITS.partNumber);
  const company = cleanText(values.company, LIMITS.company);
  const technician = cleanText(values.technician, LIMITS.technician);
  const workOrder = cleanText(values.workOrder, LIMITS.workOrder);
  const quantity = String(values.quantity ?? '').trim();

  if (!values.noFg && !fgNumber) {
    errors.fgNumber = 'Enter the FG number, or mark that there is no FG number.';
  }
  if (values.noFg && fgNumber) {
    errors.fgNumber = 'Clear the FG number, or uncheck “No FG number”.';
  }
  if (!description) errors.description = 'Enter a description.';
  if (!partNumber) errors.partNumber = 'Enter the part number.';
  if (!company) errors.company = 'Enter the company.';
  if (!/^[1-9]\d{0,5}$/.test(quantity)) {
    errors.quantity = 'Enter a whole number from 1 to 999999.';
  }
  if (!technician) errors.technician = 'Enter the technician’s name.';

  return {
    errors,
    value: {
      fgNumber: values.noFg ? '' : fgNumber,
      description,
      partNumber,
      company,
      quantity: errors.quantity ? quantity : Number(quantity),
      technician,
      workOrder,
    },
  };
}

export function movementLabel(movement) {
  if (movement === 'OUT') return 'Take part out';
  if (movement === 'RETURN') return 'Put part back';
  return movement || '';
}
