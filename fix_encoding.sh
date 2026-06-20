#!/bin/bash
# 修复所有编码问题
sed -i "s/new Notice(\`✅ 已切换到: \${sourceName}\`)/new Notice('✅ 已切换到: ' + sourceName)/g" src/SettingsTab.ts
sed -i "s/new Notice(\`✅ 已删除: \${source.name}\`)/new Notice('✅ 已删除: ' + source.name)/g" src/SettingsTab.ts
sed -i "s/new Notice(\`❌ 切换失败: \${error}\`)/new Notice('❌ 切换失败: ' + error)/g" src/SettingsTab.ts
sed -i "s/new Notice(\`❌ 删除失败: \${error}\`)/new Notice('❌ 删除失败: ' + error)/g" src/SettingsTab.ts
sed -i "s/new Notice(\`✅ 已更新 Keys: \${sourceName}\`)/new Notice('✅ 已更新 Keys: ' + sourceName)/g" src/SettingsTab.ts
sed -i "s/new Notice(\`❌ 更新失败: \${error}\`)/new Notice('❌ 更新失败: ' + error)/g" src/SettingsTab.ts
echo "✅ 修复完成"
