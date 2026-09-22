// 自动生成的离线兜底数据（与 data/cards.json 保持一致，勿手改；改请改 data/cards.json 后重新生成）
window.SEED = {
  "version": 1,
  "updatedAt": "2026-09-20T12:00:00.000Z",
  "cards": [
    {
      "id": "demo-0001",
      "title": "1. 两数之和",
      "difficulty": "简单",
      "tags": [
        "哈希表",
        "数组"
      ],
      "lang": "cpp",
      "body": "【题目】给定一个整数数组 nums 和目标值 target，找出和为目标值的两个整数的下标。\n\n【思路】一遍哈希表：遍历数组，对每个数 x 先查 target - x 是否出现过，出现即返回两下标；否则把 x 存入哈希表。时间 O(n)，空间 O(n)。",
      "code": "class Solution {\npublic:\n    vector<int> twoSum(vector<int>& nums, int target) {\n        unordered_map<int, int> seen;          // 值 -> 下标\n        for (int i = 0; i < (int)nums.size(); ++i) {\n            auto it = seen.find(target - nums[i]);\n            if (it != seen.end()) return {it->second, i};\n            seen[nums[i]] = i;\n        }\n        return {};\n    }\n};",
      "updatedAt": "2026-09-20T12:00:00.000Z"
    },
    {
      "id": "demo-0002",
      "title": "206. 反转链表",
      "difficulty": "简单",
      "tags": [
        "链表",
        "双指针"
      ],
      "lang": "cpp",
      "body": "【题目】给定单链表头节点 head，反转链表并返回新头节点。\n\n【思路】迭代三指针：prev 指向已反转部分，head 指向待处理节点，每轮先把 head->next 暂存，再让 head 指向 prev，三个指针整体右移。时间 O(n)，空间 O(1)。",
      "code": "class Solution {\npublic:\n    ListNode* reverseList(ListNode* head) {\n        ListNode* prev = nullptr;\n        while (head) {\n            ListNode* nxt = head->next;   // 暂存后继\n            head->next = prev;            // 反转指向\n            prev = head;                  // prev 前进\n            head = nxt;                   // head 前进\n        }\n        return prev;\n    }\n};",
      "updatedAt": "2026-09-20T12:01:00.000Z"
    },
    {
      "id": "demo-0003",
      "title": "704. 二分查找",
      "difficulty": "简单",
      "tags": [
        "二分",
        "数组"
      ],
      "lang": "cpp",
      "body": "【题目】给定升序数组 nums 和目标值 target，找到则返回下标，否则返回 -1。\n\n【思路】闭区间 [lo, hi] 二分：mid 用 lo + (hi - lo) / 2 防溢出；nums[mid] < target 时 lo = mid + 1，否则 hi = mid - 1。循环条件 lo <= hi。时间 O(log n)。",
      "code": "class Solution {\npublic:\n    int search(vector<int>& nums, int target) {\n        int lo = 0, hi = (int)nums.size() - 1;\n        while (lo <= hi) {\n            int mid = lo + (hi - lo) / 2;\n            if (nums[mid] == target) return mid;\n            if (nums[mid] < target) lo = mid + 1;\n            else hi = mid - 1;\n        }\n        return -1;\n    }\n};",
      "updatedAt": "2026-09-20T12:02:00.000Z"
    }
  ],
  "deleted": {}
};
