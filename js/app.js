// 表の初期データ（3行 × 3列）
const data = [
    ['タスクA', '2024-01-01', '2024-01-05'],
    ['タスクB', '2024-01-03', '2024-01-10'],
    ['タスクC', '2024-01-08', '2024-01-12']
];

// jexcel のインスタンスを保持（これ1回だけ）
let table = jexcel(document.getElementById('sheet'), {
    data: data,
    minDimensions: [3, 3], // 最低3列3行
    tableOverflow: true,
    tableHeight: '300px',
    freezeColumns: 1, // 1列固定
});

// 行追加
document.getElementById('addRowBtn').addEventListener('click', () => {
    table.insertRow();
});

// 列追加
document.getElementById('addColBtn').addEventListener('click', () => {
    table.insertColumn();
});
