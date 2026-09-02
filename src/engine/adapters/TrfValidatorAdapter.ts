import { TrfValidatorAdapter, TrfValidationResult } from './types';

/**
 * TrfValidatorAdapter
 * 
 * Formal adapter for strict TRF16 and TRF26 format validation.
 * Reports TRF_VALIDATOR_NOT_CONFIGURED until reference engine validator is integrated.
 */
export class StrictTrfValidatorAdapter implements TrfValidatorAdapter {
  public readonly id = 'trf26-strict-validator';
  public readonly name = 'FIDE TRF26 Reference Validator';
  public readonly version = '1.05.01';
  public readonly authoritative = true;

  public async isAvailable(): Promise<boolean> {
    return false;
  }

  public async validateTrf(trfContent: string): Promise<TrfValidationResult> {
    return {
      status: 'TRF_VALIDATOR_NOT_CONFIGURED',
      valid: false,
      validator: {
        id: this.id,
        name: this.name,
        version: this.version
      },
      timestamp: new Date().toISOString(),
      issues: [
        {
          code: 'TRF_VALIDATOR_NOT_CONFIGURED',
          message: 'Authoritative TRF validation service is not configured in this environment.',
          severity: 'WARNING'
        }
      ]
    };
  }
}
