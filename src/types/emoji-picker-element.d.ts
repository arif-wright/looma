declare namespace svelteHTML {
  interface IntrinsicElements {
    'emoji-picker': {
      class?: string;
      'data-source'?: string;
      locale?: string;
      onemojiClick?: (event: CustomEvent<{ unicode?: string; emoji?: { unicode?: string; annotation?: string } }>) => void;
      'on:emoji-click'?: (event: CustomEvent<{ unicode?: string; emoji?: { unicode?: string; annotation?: string } }>) => void;
    };
  }
}
