import { useEffect, useMemo, useState } from "react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";

type LanguageOption = {
  value: string;
  label: string;
};

const COMMON_LANGUAGE_OPTIONS: LanguageOption[] = [
  { value: "en-US", label: "English (US)" },
  { value: "en-GB", label: "English (UK)" },
  { value: "fr-CA", label: "French (Canada)" },
  { value: "fr-FR", label: "French (France)" },
  { value: "es-ES", label: "Spanish (Spain)" },
  { value: "es-MX", label: "Spanish (Mexico)" },
  { value: "ja-JP", label: "Japanese" },
  { value: "ko-KR", label: "Korean" },
  { value: "zh-CN", label: "Chinese (Simplified)" },
  { value: "zh-TW", label: "Chinese (Traditional)" },
];

interface SpeechRecognitionSettingsProps {
  language: string;
  onLanguageChange: (language: string) => void;
  preferOnDevice: boolean;
  onPreferOnDeviceChange: (value: boolean) => void;
  supportsOnDevice: boolean;
  contextPhrases: string[];
  onContextPhrasesChange: (phrases: string[]) => void;
  supportsContextualPhrases: boolean;
}

export function SpeechRecognitionSettings({
  language,
  onLanguageChange,
  preferOnDevice,
  onPreferOnDeviceChange,
  supportsOnDevice,
  contextPhrases,
  onContextPhrasesChange,
  supportsContextualPhrases,
}: SpeechRecognitionSettingsProps) {
  const [phrasesText, setPhrasesText] = useState(contextPhrases.join(", "));

  useEffect(() => {
    setPhrasesText(contextPhrases.join(", "));
  }, [contextPhrases]);

  const languageOptions = useMemo(() => {
    const options = [...COMMON_LANGUAGE_OPTIONS];
    if (language && !options.find((option) => option.value === language)) {
      options.unshift({ value: language, label: language });
    }
    return options;
  }, [language]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Speech Recognition Settings</CardTitle>
        <CardDescription>
          Configure recognition language and optional accuracy features.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="speech-language">Recognition Language</Label>
          <Select value={language} onValueChange={onLanguageChange}>
            <SelectTrigger id="speech-language">
              <SelectValue placeholder="Select language" />
            </SelectTrigger>
            <SelectContent>
              {languageOptions.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-start justify-between gap-4 rounded-md border border-border p-3">
          <div className="space-y-1">
            <Label htmlFor="speech-on-device" className="text-sm">
              On-device Recognition
            </Label>
            <p className="text-xs text-muted-foreground">
              Process speech locally when supported by your browser and language pack.
            </p>
          </div>
          <Switch
            id="speech-on-device"
            checked={preferOnDevice && supportsOnDevice}
            onCheckedChange={onPreferOnDeviceChange}
            disabled={!supportsOnDevice}
          />
        </div>
        {!supportsOnDevice && (
          <p className="text-xs text-muted-foreground">
            On-device mode is not available in this browser.
          </p>
        )}

        <div className="space-y-2">
          <Label htmlFor="speech-context">
            Context Phrases (optional, comma-separated)
          </Label>
          <Input
            id="speech-context"
            value={phrasesText}
            onChange={(event) => setPhrasesText(event.target.value)}
            onBlur={() => {
              const phrases = phrasesText
                .split(",")
                .map((part) => part.trim())
                .filter(Boolean);
              onContextPhrasesChange(phrases);
            }}
            placeholder="e.g. speaker argued, in conclusion, climate change"
            disabled={!supportsContextualPhrases}
          />
          {!supportsContextualPhrases && (
            <p className="text-xs text-muted-foreground">
              Context phrase biasing is not supported in this browser.
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
