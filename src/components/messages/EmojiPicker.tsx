import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Smile } from "lucide-react";

const EMOJI_CATEGORIES = {
  "Smileys": ["😀", "😃", "😄", "😁", "😅", "😂", "🤣", "😊", "😇", "🙂", "😉", "😍", "🥰", "😘", "😗"],
  "Gestes": ["👍", "👎", "👏", "🙌", "🤝", "✋", "👋", "💪", "🙏", "✌️", "🤞", "🤟", "👌", "🤙", "👊"],
  "Coeurs": ["❤️", "🧡", "💛", "💚", "💙", "💜", "🖤", "🤍", "🤎", "💔", "❣️", "💕", "💞", "💓", "💗"],
  "Objets": ["📚", "✏️", "📝", "📅", "⏰", "🎓", "🏆", "🎯", "💡", "📊", "📈", "✅", "❌", "⚠️", "💬"],
};

interface EmojiPickerProps {
  onEmojiSelect: (emoji: string) => void;
}

export function EmojiPicker({ onEmojiSelect }: EmojiPickerProps) {
  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState<keyof typeof EMOJI_CATEGORIES>("Smileys");

  const handleEmojiClick = (emoji: string) => {
    onEmojiSelect(emoji);
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="h-9 w-9">
          <Smile className="h-5 w-5 text-muted-foreground" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-2" align="start">
        <div className="flex gap-1 mb-2 flex-wrap">
          {Object.keys(EMOJI_CATEGORIES).map((cat) => (
            <Button
              key={cat}
              variant={category === cat ? "secondary" : "ghost"}
              size="sm"
              onClick={() => setCategory(cat as keyof typeof EMOJI_CATEGORIES)}
              className="text-xs px-2 py-1 h-7"
            >
              {cat}
            </Button>
          ))}
        </div>
        <div className="grid grid-cols-8 gap-1">
          {EMOJI_CATEGORIES[category].map((emoji) => (
            <button
              key={emoji}
              onClick={() => handleEmojiClick(emoji)}
              className="p-1.5 hover:bg-muted rounded-md text-lg transition-colors"
            >
              {emoji}
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
