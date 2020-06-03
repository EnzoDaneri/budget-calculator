
<script>
import { setContext } from 'svelte';
//Components
 import Navbar from './Navbar.svelte';
 import ExpensesList from './ExpensesList.svelte';
 //Data
 import expensesData from './expenses.js';
//Variables
 let expenses = [...expensesData];
 //Functions
 const removeExpense= (id) => {
     expenses = expenses.filter(item => item.id !== id);
 }
 //Context
 setContext('remove', removeExpense)

</script>


<Navbar/>
<main class="content">
<ExpensesList {expenses} />
</main>
