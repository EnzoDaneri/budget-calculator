<script>
 import SectionTitle from './Title.svelte';
 import Expense from './Expense.svelte';
export let expenses= [];
</script>

<style>
h2 {
    text-transform: capitalize;
}

</style>


<section>
<SectionTitle title="expense List"/>
<ul>
{#each expenses as expense, index}
<Expense {...expense}/>
{:else}
<h2>no expenses added to the list</h2>

{/each}


</ul>
</section>