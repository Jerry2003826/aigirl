import { Personality } from '../App';
import { SafeAvatar } from './SafeAvatar';
import { Avatar, AvatarFallback } from './ui/avatar';
import { Input } from './ui/input';
import { ScrollArea } from './ui/scroll-area';
import { Badge } from './ui/badge';
import { Search, User } from 'lucide-react';
import { useState, useMemo } from 'react';
import { pinyin } from 'pinyin-pro';

interface ContactsListProps {
  personalities: Personality[];
  currentPersonalityId: string;
  onSelectContact: (personalityId: string) => void;
}

/**
 * 扩展的联系人数据结构，包含拼音和首字母
 */
interface ContactWithPinyin extends Personality {
  pinyin: string;        // 完整拼音，如 "geng ke liu xia"
  indexLetter: string;   // 首字母，如 "G"
}

/**
 * 将联系人转换为带拼音的结构
 */
function buildContactWithPinyin(personality: Personality): ContactWithPinyin {
  // 使用 pinyin-pro 转换为拼音数组，去除声调
  const pyArr = pinyin(personality.name, { toneType: 'none', type: 'array' });
  const fullPinyin = pyArr.join(' ').toLowerCase(); // 例如: "geng ke liu xia"
  
  // 取拼音中的第一个字母作为索引字母
  const firstChar = fullPinyin.split('').find(ch => /[a-zA-Z]/.test(ch));
  
  let indexLetter: string;
  if (firstChar && /[a-zA-Z]/.test(firstChar)) {
    indexLetter = firstChar.toUpperCase();
  } else {
    indexLetter = '#'; // 非字母的归到 # 组
  }
  
  return {
    ...personality,
    pinyin: fullPinyin,
    indexLetter
  };
}

export function ContactsList({ personalities, currentPersonalityId, onSelectContact }: ContactsListProps) {
  const [searchQuery, setSearchQuery] = useState('');

  // 过滤并按拼音首字母分组
  const groupedContacts = useMemo(() => {
    // 1. 将所有联系人转换为带拼音的结构
    const contactsWithPinyin = personalities.map(buildContactWithPinyin);
    
    // 2. 过滤搜索（支持中文名字和拼音搜索）
    const filtered = contactsWithPinyin.filter(c => {
      if (!searchQuery.trim()) return true;
      const query = searchQuery.toLowerCase();
      return c.name.toLowerCase().includes(query) || c.pinyin.includes(query);
    });

    // 3. 按拼音首字母分组
    const groups: { [key: string]: ContactWithPinyin[] } = {};
    
    filtered.forEach(contact => {
      const letter = contact.indexLetter;
      if (!groups[letter]) {
        groups[letter] = [];
      }
      groups[letter].push(contact);
    });

    // 4. 对每组内部按拼音排序
    Object.keys(groups).forEach(letter => {
      groups[letter].sort((a, b) => {
        // 首先按拼音排序
        if (a.pinyin < b.pinyin) return -1;
        if (a.pinyin > b.pinyin) return 1;
        // 拼音相同再按原名排序
        return a.name.localeCompare(b.name, 'zh-CN');
      });
    });

    // 5. 排序字母（A-Z，然后#）
    const sortedLetters = Object.keys(groups).sort((a, b) => {
      if (a === '#') return 1;
      if (b === '#') return -1;
      return a.localeCompare(b);
    });

    return sortedLetters.map(letter => ({
      letter,
      contacts: groups[letter]
    }));
  }, [personalities, searchQuery]);

  return (
    <div className="flex flex-col h-full relative">
      {/* 搜索栏 */}
      <div className="flex-shrink-0 p-3 border-b bg-surface-dim">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="搜索联系人"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9 h-9 bg-surface"
          />
        </div>
        
        {/* 统计信息 */}
        <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
          <div className="flex items-center gap-2">
            <User className="w-3 h-3" />
            <span>{personalities.length} 位联系人</span>
          </div>
          {searchQuery && groupedContacts.length > 0 && (
            <span className="text-primary">
              找到 {groupedContacts.reduce((sum, g) => sum + g.contacts.length, 0)} 个结果
            </span>
          )}
        </div>
      </div>

      {/* 联系人列表 */}
      <ScrollArea className="flex-1">
        {groupedContacts.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full py-12 px-6 text-center">
            <div className="bg-gradient-to-br from-primary/10 to-primary/5 rounded-full p-6 mb-4">
              <User className="w-12 h-12 text-primary/50" />
            </div>
            <h3 className="text-foreground mb-2">
              {searchQuery ? '未找到联系人' : '还没有联系人'}
            </h3>
            <p className="text-sm text-muted-foreground max-w-xs">
              {searchQuery 
                ? '试试其他关键词或清空搜索' 
                : '创建你的第一个AI女友，开始你的虚拟陪伴之旅'}
            </p>
          </div>
        ) : (
          <div className="px-2 py-2">
            {groupedContacts.map(({ letter, contacts }) => (
              <div key={letter} id={`letter-${letter}`} className="mb-6">
                {/* 首字母标题 */}
                <div className="sticky top-0 bg-surface-dim/95 backdrop-blur-sm py-2 px-2 -mx-2 mb-2 z-10 border-b border-border/50">
                  <h3 className="text-xs font-semibold text-primary/70 tracking-wider">{letter}</h3>
                </div>

                {/* 联系人列表 */}
                <div className="space-y-0.5">
                  {contacts.map(personality => {
                    const isActive = personality.id === currentPersonalityId;
                    
                    return (
                      <div
                        key={personality.id}
                        onClick={() => onSelectContact(personality.id)}
                        className={`
                          group flex items-center gap-2 pl-2 pr-1 py-2.5 rounded-lg cursor-pointer 
                          transition-all duration-200
                          ${isActive 
                            ? 'bg-primary/10 ring-2 ring-primary/30 shadow-sm' 
                            : 'hover:bg-surface-hover active:bg-surface-active hover:shadow-sm'
                          }
                        `}
                      >
                        {/* 头像 */}
                        <div className="relative flex-shrink-0">
                          <SafeAvatar
                            avatarUrl={personality.avatarUrl}
                            name={personality.name}
                            size="md"
                          />
                          {/* 在线状态指示器（示例） */}
                          <div className="absolute bottom-0 right-0 w-3 h-3 bg-green-500 rounded-full border-2 border-surface" />
                        </div>

                        {/* 信息 */}
                        <div className="flex-1 min-w-0 pr-1">
                          <div className="flex items-center gap-1.5 mb-0.5">
                            <h3 className={`text-sm truncate max-w-full ${
                              isActive ? 'font-medium text-primary' : 'text-foreground'
                            }`}>
                              {personality.name}
                            </h3>
                          </div>
                          

                        </div>

                        {/* 当前活跃标识 */}
                        {isActive && (
                          <Badge variant="secondary" className="bg-primary/20 text-primary text-[10px] flex-shrink-0 px-1.5 py-0.5">
                            当前
                          </Badge>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </ScrollArea>

      {/* 快速索引条（适合联系人很多的情况） */}
      {groupedContacts.length > 5 && !searchQuery && (
        <div className="absolute right-0 top-1/2 transform -translate-y-1/2 flex flex-col items-center py-2 bg-surface/80 backdrop-blur-sm rounded-l-lg shadow-lg z-20">
          {groupedContacts.map(({ letter }) => (
            <button
              key={letter}
              onClick={() => {
                const element = document.getElementById(`letter-${letter}`);
                element?.scrollIntoView({ behavior: 'smooth', block: 'start' });
              }}
              className="text-[10px] text-primary/70 hover:text-primary hover:bg-primary/10 font-semibold py-1 px-1.5 hover:scale-110 transition-all rounded-sm"
              title={`跳转到 ${letter}`}
            >
              {letter}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
