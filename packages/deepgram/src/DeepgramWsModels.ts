export interface DeepgramWord {
  word?: string;
  punctuated_word?: string;
  start?: number;
  end?: number;
  confidence?: number;
  speaker?: number;
}

export interface DeepgramAlternative {
  transcript?: string;
  confidence?: number;
  language?: string;
  words?: ReadonlyArray<DeepgramWord>;
}

export interface DeepgramResultsMessage {
  type?: string;
  channel?: {
    alternatives?: ReadonlyArray<DeepgramAlternative>;
  };
  channel_index?: ReadonlyArray<number>;
  is_final?: boolean;
  speech_final?: boolean;
  start?: number;
  end?: number;
  duration?: number;
  metadata?: Record<string, unknown>;
}

export interface DeepgramUtteranceEndMessage {
  type: 'UtteranceEnd';
  channel?: ReadonlyArray<number>;
  last_word_end?: number;
}
